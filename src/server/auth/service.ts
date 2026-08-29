import {
  getAdminAuthThrottleHmacKey,
} from './env.ts';

import {
  hashAuthThrottleKey,
} from './hmac.ts';

import {
  getAdminByCanonicalEmail,
  getAuthThrottleState,
  runAuthTransaction,
  type AuthPersistenceTransaction,
} from './persistence.ts';

import {
  runDummyPasswordVerification,
  verifyPassword,
} from './password.ts';

import type {
  AdminLoginNext,
  BeginAdminLoginResult,
} from './service-contract.ts';

import {
  canonicalizeAdminEmail,
  createLoginChallengeExpiresAt,
  isAdminEmailInputValid,
  isAdminPasswordInputValid,
  isAuthThrottleBlocked,
  requireCanonicalClientIp,
} from './service-foundation.ts';

import {
  generateOpaqueAuthToken,
  hashOpaqueAuthToken,
} from './tokens.ts';

type PasswordThrottleKeys =
  Readonly<{
    account: string;
    ip: string;
  }>;

class PasswordThrottleBlockedError
  extends Error {
  constructor() {
    super(
      'Password authentication is throttled.',
    );

    this.name =
      'PasswordThrottleBlockedError';
  }
}

function assertValidDate(
  value: Date,
  name: string,
): void {
  if (
    !(value instanceof Date) ||
    Number.isNaN(
      value.getTime(),
    )
  ) {
    throw new Error(
      `${name} must be a valid Date.`,
    );
  }
}

function passwordThrottleKeys(
  canonicalEmail: string,
  canonicalClientIp: string,
): PasswordThrottleKeys {
  const key =
    getAdminAuthThrottleHmacKey();

  return {
    account:
      hashAuthThrottleKey(
        'password_account',
        canonicalEmail,
        key,
      ),

    ip:
      hashAuthThrottleKey(
        'password_ip',
        canonicalClientIp,
        key,
      ),
  };
}

async function isPasswordThrottleBlocked(
  keys: PasswordThrottleKeys,
  now: Date,
): Promise<boolean> {
  const [
    accountState,
    ipState,
  ] =
    await Promise.all([
      getAuthThrottleState(
        'password_account',
        keys.account,
      ),

      getAuthThrottleState(
        'password_ip',
        keys.ip,
      ),
    ]);

  return (
    isAuthThrottleBlocked(
      accountState,
      now,
    ) ||
    isAuthThrottleBlocked(
      ipState,
      now,
    )
  );
}

async function recordPasswordFailure(
  tx: AuthPersistenceTransaction,
  keys: PasswordThrottleKeys,
  now: Date,
): Promise<void> {
  const accountResult =
    await tx.recordAuthThrottleFailure(
      'password_account',
      keys.account,
      now,
    );

  if (accountResult.blocked) {
    throw new PasswordThrottleBlockedError();
  }

  const ipResult =
    await tx.recordAuthThrottleFailure(
      'password_ip',
      keys.ip,
      now,
    );

  if (ipResult.blocked) {
    /*
     * Throwing aborts the surrounding transaction,
     * including the account failure recorded above.
     */
    throw new PasswordThrottleBlockedError();
  }
}

async function persistInvalidPasswordAttempt(
  keys: PasswordThrottleKeys,
  now: Date,
): Promise<
  BeginAdminLoginResult
> {
  try {
    await runAuthTransaction(
      async (tx) => {
        await recordPasswordFailure(
          tx,
          keys,
          now,
        );
      },
    );
  } catch (error) {
    if (
      error instanceof
        PasswordThrottleBlockedError
    ) {
      return {
        ok: false,
        reason: 'throttled',
      };
    }

    throw error;
  }

  return {
    ok: false,
    reason: 'invalid_credentials',
  };
}

export async function beginAdminLogin(
  input: {
    email: string;
    password: string;
    clientIp: string;
    now: Date;
  },
): Promise<
  BeginAdminLoginResult
> {
  assertValidDate(
    input.now,
    'Admin login time',
  );

  const canonicalEmail =
    canonicalizeAdminEmail(
      input.email,
    );

  const canonicalClientIp =
    requireCanonicalClientIp(
      input.clientIp,
    );

  const keys =
    passwordThrottleKeys(
      canonicalEmail,
      canonicalClientIp,
    );

  if (
    await isPasswordThrottleBlocked(
      keys,
      input.now,
    )
  ) {
    return {
      ok: false,
      reason: 'throttled',
    };
  }

  const emailIsValid =
    isAdminEmailInputValid(
      input.email,
    );

  const passwordIsValid =
    isAdminPasswordInputValid(
      input.password,
    );

  let credential =
    emailIsValid &&
    passwordIsValid
      ? await getAdminByCanonicalEmail(
          canonicalEmail,
        )
      : null;

  let passwordVerified =
    false;

  if (passwordIsValid) {
    if (credential) {
      passwordVerified =
        await verifyPassword(
          input.password,
          credential.passwordHash,
        );
    } else {
      await runDummyPasswordVerification(
        input.password,
      );
    }
  }

  if (
    !emailIsValid ||
    !passwordIsValid ||
    !credential ||
    !passwordVerified
  ) {
    return persistInvalidPasswordAttempt(
      keys,
      input.now,
    );
  }

  const verifiedCredential =
    credential;


  const challengeToken =
    generateOpaqueAuthToken();

  const challengeTokenHash =
    hashOpaqueAuthToken(
      challengeToken,
    );

  const challengeExpiresAt =
    createLoginChallengeExpiresAt(
      input.now,
    );

  try {
    return await runAuthTransaction(
      async (tx) => {
        const accountState =
          await tx.getAuthThrottleState(
            'password_account',
            keys.account,
          );

        const ipState =
          await tx.getAuthThrottleState(
            'password_ip',
            keys.ip,
          );

        if (
          isAuthThrottleBlocked(
            accountState,
            input.now,
          ) ||
          isAuthThrottleBlocked(
            ipState,
            input.now,
          )
        ) {
          return {
            ok: false,
            reason: 'throttled',
          } as const;
        }

        const lockedAdmin =
          await tx.lockAdminForAuth(
            verifiedCredential.id,
          );

        if (
          !lockedAdmin ||
          !lockedAdmin.isActive ||
          lockedAdmin
            .passwordChangedAt
            .getTime() !==
            verifiedCredential
              .passwordChangedAt
              .getTime()
        ) {
          await recordPasswordFailure(
            tx,
            keys,
            input.now,
          );

          return {
            ok: false,
            reason:
              'invalid_credentials',
          } as const;
        }

        const totpFactor =
          await tx
            .lockAdminTotpFactorByAdminId(
              lockedAdmin.id,
            );

        const next:
          AdminLoginNext =
            totpFactor?.confirmedAt
              ? 'mfa'
              : 'enrollment';

        await tx.resetAuthThrottle(
          'password_account',
          keys.account,
          input.now,
        );

        await tx.resetAuthThrottle(
          'password_ip',
          keys.ip,
          input.now,
        );

        await tx
          .invalidateActiveLoginChallenge(
            lockedAdmin.id,
            input.now,
          );

        await tx.insertLoginChallenge({
          adminId:
            lockedAdmin.id,

          tokenHash:
            challengeTokenHash,

          type:
            next,

          expiresAt:
            challengeExpiresAt,

          createdAt:
            input.now,
        });

        return {
          ok: true,
          challengeToken,
          next,
        } as const;
      },
    );
  } catch (error) {
    if (
      error instanceof
        PasswordThrottleBlockedError
    ) {
      return {
        ok: false,
        reason: 'throttled',
      };
    }

    throw error;
  }
}
