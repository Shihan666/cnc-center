import type {
  CompleteAdminSecondFactorResult,
} from './service-contract.ts';
import {
  getAdminAuthThrottleHmacKey,
  getAdminRecoveryCodeHmacKey,
  getAdminTotpEncryptionKey,
} from './env.ts';

import {
  hashAuthThrottleKey,
  hashRecoveryCodeForLookup,
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
  ConfirmAdminTotpEnrollmentResult,
  PrepareAdminTotpEnrollmentResult,
} from './service-contract.ts';

import {
  canonicalizeAdminEmail,
  createAdminSessionTiming,
  createLoginChallengeExpiresAt,
  isAdminEmailInputValid,
  isAdminPasswordInputValid,
  isAuthThrottleBlocked,
  isLoginChallengeActive,
  requireCanonicalClientIp,
  transitionLoginChallengeFailure,
} from './service-foundation.ts';

import {
  generateOpaqueAuthToken,
  hashOpaqueAuthToken,
} from './tokens.ts';
import {
  decryptTotpSecret,
  encryptTotpSecret,
} from './totp-secret.ts';
import {
  buildTotpEnrollmentUri,
  generateTotpSecret,
  totpSecretToBase32,
  verifyTotpToken,
} from './totp.ts';
import {
  generateRecoveryCodes,
  isRecoveryCodeFormat,
} from './recovery-codes.ts';

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
export async function prepareAdminTotpEnrollment(
  input: {
    challengeToken: string;
    now: Date;
  },
): Promise<
  PrepareAdminTotpEnrollmentResult
> {
  assertValidDate(
    input.now,
    'TOTP enrollment preparation time',
  );

  const challengeTokenHash =
    hashOpaqueAuthToken(
      input.challengeToken,
    );

  const encryptionKey =
    getAdminTotpEncryptionKey();

  return runAuthTransaction(
    async (tx) => {
      const challenge =
        await tx
          .lockLoginChallengeByTokenHash(
            challengeTokenHash,
          );

      if (
        !challenge ||
        challenge.type !==
          'enrollment' ||
        !isLoginChallengeActive(
          challenge,
          input.now,
        )
      ) {
        return {
          ok: false,
          reason:
            'invalid_challenge',
        } as const;
      }

      const admin =
        await tx.lockAdminForAuth(
          challenge.adminId,
        );

      if (
        !admin ||
        !admin.isActive
      ) {
        return {
          ok: false,
          reason:
            'invalid_challenge',
        } as const;
      }

      const factor =
        await tx
          .lockAdminTotpFactorByAdminId(
            admin.id,
          );

      let secret: Buffer;

      if (factor) {
        if (factor.confirmedAt) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        secret =
          decryptTotpSecret(
            {
              secretCiphertext:
                Buffer.from(
                  factor.secretCiphertext,
                ),
              secretNonce:
                Buffer.from(
                  factor.secretNonce,
                ),
              secretAuthTag:
                Buffer.from(
                  factor.secretAuthTag,
                ),
              keyVersion:
                factor.keyVersion,
            },
            encryptionKey,
          );
      } else {
        secret =
          generateTotpSecret();

        const encrypted =
          encryptTotpSecret(
            secret,
            encryptionKey,
          );

        await tx.insertAdminTotpFactor({
          adminId:
            admin.id,
          secretCiphertext:
            encrypted
              .secretCiphertext,
          secretNonce:
            encrypted.secretNonce,
          secretAuthTag:
            encrypted.secretAuthTag,
          keyVersion:
            encrypted.keyVersion,
          createdAt:
            input.now,
          updatedAt:
            input.now,
        });
      }

      return {
        ok: true,
        secretBase32:
          totpSecretToBase32(
            secret,
          ),
        enrollmentUri:
          buildTotpEnrollmentUri(
            secret,
            admin.email,
          ),
      } as const;
    },
  );
}
type MfaThrottleKeys =
  Readonly<{
    account: string;
    ip: string;
  }>;

class MfaThrottleBlockedError
  extends Error {}

function mfaThrottleKeys(
  adminId: string,
  clientIp: string,
): MfaThrottleKeys {
  const key =
    getAdminAuthThrottleHmacKey();

  return {
    account:
      hashAuthThrottleKey(
        'mfa_account',
        adminId,
        key,
      ),

    ip:
      hashAuthThrottleKey(
        'mfa_ip',
        clientIp,
        key,
      ),
  };
}

async function recordMfaFailure(
  tx: AuthPersistenceTransaction,
  keys: MfaThrottleKeys,
  now: Date,
): Promise<void> {
  const accountResult =
    await tx.recordAuthThrottleFailure(
      'mfa_account',
      keys.account,
      now,
    );

  if (accountResult.blocked) {
    throw new MfaThrottleBlockedError(
      'MFA account throttle became blocked before failure recording completed.',
    );
  }

  const ipResult =
    await tx.recordAuthThrottleFailure(
      'mfa_ip',
      keys.ip,
      now,
    );

  if (ipResult.blocked) {
    throw new MfaThrottleBlockedError(
      'MFA IP throttle became blocked before failure recording completed.',
    );
  }
}

export async function confirmAdminTotpEnrollment(
  input: {
    challengeToken: string;
    totpToken: string;
    clientIp: string;
    now: Date;
  },
): Promise<
  ConfirmAdminTotpEnrollmentResult
> {
  assertValidDate(
    input.now,
    'TOTP enrollment confirmation time',
  );

  const canonicalClientIp =
    requireCanonicalClientIp(
      input.clientIp,
    );

  const challengeTokenHash =
    hashOpaqueAuthToken(
      input.challengeToken,
    );

  const encryptionKey =
    getAdminTotpEncryptionKey();

  const recoveryCodeHmacKey =
    getAdminRecoveryCodeHmacKey();

  try {
    return await runAuthTransaction(
      async (tx) => {
        const challenge =
          await tx
            .lockLoginChallengeByTokenHash(
              challengeTokenHash,
            );

        if (
          !challenge ||
          challenge.type !==
            'enrollment' ||
          !isLoginChallengeActive(
            challenge,
            input.now,
          )
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const admin =
          await tx.lockAdminForAuth(
            challenge.adminId,
          );

        if (
          !admin ||
          !admin.isActive
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const throttleKeys =
          mfaThrottleKeys(
            admin.id,
            canonicalClientIp,
          );

        const accountState =
          await tx.getAuthThrottleState(
            'mfa_account',
            throttleKeys.account,
          );

        const ipState =
          await tx.getAuthThrottleState(
            'mfa_ip',
            throttleKeys.ip,
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
            reason:
              'throttled',
          } as const;
        }

        const factor =
          await tx
            .lockAdminTotpFactorByAdminId(
              admin.id,
            );

        if (
          !factor ||
          factor.confirmedAt
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const secret =
          decryptTotpSecret(
            {
              secretCiphertext:
                Buffer.from(
                  factor.secretCiphertext,
                ),
              secretNonce:
                Buffer.from(
                  factor.secretNonce,
                ),
              secretAuthTag:
                Buffer.from(
                  factor.secretAuthTag,
                ),
              keyVersion:
                factor.keyVersion,
            },
            encryptionKey,
          );

        const verification =
          verifyTotpToken({
            secret,
            token:
              input.totpToken,
            timestamp:
              input.now.getTime(),
            lastUsedCounter:
              factor.lastUsedCounter,
          });

        if (!verification.valid) {
          const transition =
            transitionLoginChallengeFailure(
              challenge.attemptCount,
              input.now,
            );

          const challengeUpdated =
            await tx
              .applyLoginChallengeFailure(
                challenge.id,
                transition,
              );

          if (!challengeUpdated) {
            throw new Error(
              'Login challenge failure transition lost its locked expected state.',
            );
          }

          await recordMfaFailure(
            tx,
            throttleKeys,
            input.now,
          );

          return {
            ok: false,
            reason:
              'invalid_second_factor',
          } as const;
        }

        const factorConfirmed =
          await tx.confirmAdminTotpFactor(
            factor.id,
            factor.updatedAt,
            verification.counter,
            input.now,
          );

        if (!factorConfirmed) {
          throw new Error(
            'TOTP factor confirmation lost its locked expected state.',
          );
        }

        const recoveryCodes =
          generateRecoveryCodes();

        const recoveryCodeInputs =
          recoveryCodes.map(
            (code) => ({
              adminId:
                admin.id,
              codeHash:
                hashRecoveryCodeForLookup(
                  code,
                  recoveryCodeHmacKey,
                ),
              createdAt:
                input.now,
            }),
          );

        await tx.insertAdminRecoveryCodes(
          recoveryCodeInputs,
        );

        const sessionToken =
          generateOpaqueAuthToken();

        await tx.insertAdminSession({
          adminId:
            admin.id,
          tokenHash:
            hashOpaqueAuthToken(
              sessionToken,
            ),
          authMethod:
            'totp',
          timing:
            createAdminSessionTiming(
              input.now,
            ),
        });

        const challengeConsumed =
          await tx.consumeLoginChallenge(
            challenge.id,
            input.now,
          );

        if (!challengeConsumed) {
          throw new Error(
            'Login challenge consumption lost its locked expected state.',
          );
        }

        await tx.resetAuthThrottle(
          'mfa_account',
          throttleKeys.account,
          input.now,
        );

        await tx.resetAuthThrottle(
          'mfa_ip',
          throttleKeys.ip,
          input.now,
        );

        const lastLoginUpdated =
          await tx.setAdminLastLoginAt(
            admin.id,
            input.now,
          );

        if (!lastLoginUpdated) {
          throw new Error(
            'Admin last-login update failed during TOTP enrollment confirmation.',
          );
        }

        return {
          ok: true,
          sessionToken,
          admin: {
            id:
              admin.id,
            email:
              admin.email,
          },
          recoveryCodes,
        } as const;
      },
    );
  } catch (error) {
    if (
      error instanceof
        MfaThrottleBlockedError
    ) {
      return {
        ok: false,
        reason:
          'throttled',
      };
    }

    throw error;
  }
}
export async function completeAdminTotpLogin(
  input: {
    challengeToken: string;
    totpToken: string;
    clientIp: string;
    now: Date;
  },
): Promise<
  CompleteAdminSecondFactorResult
> {
  assertValidDate(
    input.now,
    'Admin TOTP login time',
  );

  const canonicalClientIp =
    requireCanonicalClientIp(
      input.clientIp,
    );

  const challengeTokenHash =
    hashOpaqueAuthToken(
      input.challengeToken,
    );

  const totpEncryptionKey =
    getAdminTotpEncryptionKey();

  try {
    return await runAuthTransaction(
      async (tx) => {
        const challenge =
          await tx
            .lockLoginChallengeByTokenHash(
              challengeTokenHash,
            );

        if (
          !challenge ||
          challenge.type !== 'mfa' ||
          !isLoginChallengeActive(
            challenge,
            input.now,
          )
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const admin =
          await tx.lockAdminForAuth(
            challenge.adminId,
          );

        if (
          !admin ||
          !admin.isActive
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const keys =
          mfaThrottleKeys(
            admin.id,
            canonicalClientIp,
          );

        const accountState =
          await tx.getAuthThrottleState(
            'mfa_account',
            keys.account,
          );

        const ipState =
          await tx.getAuthThrottleState(
            'mfa_ip',
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

        const totpFactor =
          await tx
            .lockAdminTotpFactorByAdminId(
              admin.id,
            );

        if (
          !totpFactor ||
          totpFactor.confirmedAt ===
            null
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const secret =
          decryptTotpSecret(
            {
              secretCiphertext:
                Buffer.from(
                  totpFactor
                    .secretCiphertext,
                ),

              secretNonce:
                Buffer.from(
                  totpFactor
                    .secretNonce,
                ),

              secretAuthTag:
                Buffer.from(
                  totpFactor
                    .secretAuthTag,
                ),

              keyVersion:
                totpFactor.keyVersion,
            },
            totpEncryptionKey,
          );

        const verification =
          verifyTotpToken({
            secret,

            token:
              input.totpToken,

            timestamp:
              input.now.getTime(),

            lastUsedCounter:
              totpFactor
                .lastUsedCounter,
          });

        if (
          !verification.valid
        ) {
          const transition =
            transitionLoginChallengeFailure(
              challenge.attemptCount,
              input.now,
            );

          const challengeAdvanced =
            await tx
              .applyLoginChallengeFailure(
                challenge.id,
                transition,
              );

          if (
            !challengeAdvanced
          ) {
            throw new Error(
              'TOTP login challenge failure transition lost its locked state.',
            );
          }

          await recordMfaFailure(
            tx,
            keys,
            input.now,
          );

          return {
            ok: false,
            reason:
              'invalid_second_factor',
          } as const;
        }

        const counterAdvanced =
          await tx
            .advanceConfirmedAdminTotpCounter(
              totpFactor.id,
              totpFactor
                .lastUsedCounter,
              verification.counter,
              input.now,
            );

        if (
          !counterAdvanced
        ) {
          throw new Error(
            'Confirmed TOTP counter advance lost its locked state.',
          );
        }

        const sessionToken =
          generateOpaqueAuthToken();

        const sessionTokenHash =
          hashOpaqueAuthToken(
            sessionToken,
          );

        const sessionTiming =
          createAdminSessionTiming(
            input.now,
          );

        await tx.insertAdminSession({
          adminId:
            admin.id,

          tokenHash:
            sessionTokenHash,

          authMethod:
            'totp',

          timing:
            sessionTiming,
        });

        const challengeConsumed =
          await tx.consumeLoginChallenge(
            challenge.id,
            input.now,
          );

        if (
          !challengeConsumed
        ) {
          throw new Error(
            'TOTP login challenge consumption lost its locked state.',
          );
        }

        await tx.resetAuthThrottle(
          'mfa_account',
          keys.account,
          input.now,
        );

        await tx.resetAuthThrottle(
          'mfa_ip',
          keys.ip,
          input.now,
        );

        const lastLoginUpdated =
          await tx.setAdminLastLoginAt(
            admin.id,
            input.now,
          );

        if (
          !lastLoginUpdated
        ) {
          throw new Error(
            'TOTP login admin last-login update lost its locked state.',
          );
        }

        return {
          ok: true,

          sessionToken,

          admin: {
            id:
              admin.id,

            email:
              admin.email,
          },
        } as const;
      },
    );
  } catch (error) {
    if (
      error instanceof
        MfaThrottleBlockedError
    ) {
      return {
        ok: false,
        reason: 'throttled',
      };
    }

    throw error;
  }
}
export async function completeAdminRecoveryLogin(
  input: {
    challengeToken: string;
    recoveryCode: string;
    clientIp: string;
    now: Date;
  },
): Promise<
  CompleteAdminSecondFactorResult
> {
  assertValidDate(
    input.now,
    'Admin recovery login time',
  );

  const canonicalClientIp =
    requireCanonicalClientIp(
      input.clientIp,
    );

  const challengeTokenHash =
    hashOpaqueAuthToken(
      input.challengeToken,
    );

  const recoveryCodeHmacKey =
    getAdminRecoveryCodeHmacKey();

  try {
    return await runAuthTransaction(
      async (tx) => {
        const challenge =
          await tx
            .lockLoginChallengeByTokenHash(
              challengeTokenHash,
            );

        if (
          !challenge ||
          challenge.type !== 'mfa' ||
          !isLoginChallengeActive(
            challenge,
            input.now,
          )
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const admin =
          await tx.lockAdminForAuth(
            challenge.adminId,
          );

        if (
          !admin ||
          !admin.isActive
        ) {
          return {
            ok: false,
            reason:
              'invalid_challenge',
          } as const;
        }

        const keys =
          mfaThrottleKeys(
            admin.id,
            canonicalClientIp,
          );

        const accountState =
          await tx.getAuthThrottleState(
            'mfa_account',
            keys.account,
          );

        const ipState =
          await tx.getAuthThrottleState(
            'mfa_ip',
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

        if (
          !isRecoveryCodeFormat(
            input.recoveryCode,
          )
        ) {
          const transition =
            transitionLoginChallengeFailure(
              challenge.attemptCount,
              input.now,
            );

          const challengeAdvanced =
            await tx
              .applyLoginChallengeFailure(
                challenge.id,
                transition,
              );

          if (
            !challengeAdvanced
          ) {
            throw new Error(
              'Recovery login challenge failure transition lost its locked state.',
            );
          }

          await recordMfaFailure(
            tx,
            keys,
            input.now,
          );

          return {
            ok: false,
            reason:
              'invalid_second_factor',
          } as const;
        }

        const recoveryCodeHash =
          hashRecoveryCodeForLookup(
            input.recoveryCode,
            recoveryCodeHmacKey,
          );

        const recoveryCode =
          await tx
            .lockActiveRecoveryCodeByHash(
              recoveryCodeHash,
            );

        if (
          !recoveryCode ||
          recoveryCode.adminId !==
            admin.id
        ) {
          const transition =
            transitionLoginChallengeFailure(
              challenge.attemptCount,
              input.now,
            );

          const challengeAdvanced =
            await tx
              .applyLoginChallengeFailure(
                challenge.id,
                transition,
              );

          if (
            !challengeAdvanced
          ) {
            throw new Error(
              'Recovery login challenge failure transition lost its locked state.',
            );
          }

          await recordMfaFailure(
            tx,
            keys,
            input.now,
          );

          return {
            ok: false,
            reason:
              'invalid_second_factor',
          } as const;
        }

        const recoveryConsumed =
          await tx.consumeRecoveryCode(
            recoveryCode.id,
            input.now,
          );

        if (
          !recoveryConsumed
        ) {
          throw new Error(
            'Recovery-code consumption lost its locked state.',
          );
        }

        const sessionToken =
          generateOpaqueAuthToken();

        const sessionTokenHash =
          hashOpaqueAuthToken(
            sessionToken,
          );

        const sessionTiming =
          createAdminSessionTiming(
            input.now,
          );

        await tx.insertAdminSession({
          adminId:
            admin.id,

          tokenHash:
            sessionTokenHash,

          authMethod:
            'recovery',

          timing:
            sessionTiming,
        });

        const challengeConsumed =
          await tx.consumeLoginChallenge(
            challenge.id,
            input.now,
          );

        if (
          !challengeConsumed
        ) {
          throw new Error(
            'Recovery login challenge consumption lost its locked state.',
          );
        }

        await tx.resetAuthThrottle(
          'mfa_account',
          keys.account,
          input.now,
        );

        await tx.resetAuthThrottle(
          'mfa_ip',
          keys.ip,
          input.now,
        );

        const lastLoginUpdated =
          await tx.setAdminLastLoginAt(
            admin.id,
            input.now,
          );

        if (
          !lastLoginUpdated
        ) {
          throw new Error(
            'Recovery login admin last-login update lost its locked state.',
          );
        }

        return {
          ok: true,

          sessionToken,

          admin: {
            id:
              admin.id,

            email:
              admin.email,
          },
        } as const;
      },
    );
  } catch (error) {
    if (
      error instanceof
        MfaThrottleBlockedError
    ) {
      return {
        ok: false,
        reason: 'throttled',
      };
    }

    throw error;
  }
}
