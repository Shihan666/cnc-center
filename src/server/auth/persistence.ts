import {
  and,
  eq,
  isNotNull,
  isNull,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  adminAuthThrottles,
  adminLoginChallenges,
  adminRecoveryCodes,
  adminSessions,
  adminTotpFactors,
  admins,
} from '../db/schema.ts';

import type {
  AuthThrottleScope,
} from './hmac.ts';

import type {
  AdminLoginNext,
  AdminSessionAuthMethod,
  AdminSessionRevocationReason,
} from './service-contract.ts';

import {
  canonicalizeAdminEmail,
  isAdminEmailInputValid,
  isAdminSessionRevocationReason,
  isAuthThrottleBlocked,
  resetAuthThrottleState,
  transitionAuthThrottleFailure,
  type AdminSessionTiming,
  type AuthThrottleFailureTransition,
  type AuthThrottleState,
  type ChallengeFailureTransition,
} from './service-foundation.ts';

export type RecordAuthThrottleFailureResult =
  | Readonly<{
      blocked: true;
      state: AuthThrottleState;
    }>
  | Readonly<{
      blocked: false;
      state:
        AuthThrottleFailureTransition;
    }>;

export type LockedAdmin =
  Readonly<{
    id: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
    passwordChangedAt: Date;
    lastLoginAt: Date | null;
  }>;

export type LoginChallengeRecord =
  Readonly<{
    id: string;
    adminId: string;
    tokenHash: string;
    type: AdminLoginNext;
    attemptCount: number;
    expiresAt: Date;
    consumedAt: Date | null;
    invalidatedAt: Date | null;
    createdAt: Date;
  }>;

export type InsertLoginChallengeInput =
  Readonly<{
    adminId: string;
    tokenHash: string;
    type: AdminLoginNext;
    expiresAt: Date;
    createdAt: Date;
  }>;

export type AdminSessionRecord =
  Readonly<{
    id: string;
    adminId: string;
    authMethod:
      AdminSessionAuthMethod;
    createdAt: Date;
    lastSeenAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    revokedAt: Date | null;
    revocationReason:
      AdminSessionRevocationReason | null;
  }>;

export type InsertAdminSessionInput =
  Readonly<{
    adminId: string;
    tokenHash: string;
    authMethod:
      AdminSessionAuthMethod;
    timing:
      AdminSessionTiming;
  }>;

export type AdminTotpFactorRecord =
  Readonly<{
    id: string;
    adminId: string;
    secretCiphertext: Uint8Array;
    secretNonce: Uint8Array;
    secretAuthTag: Uint8Array;
    keyVersion: number;
    lastUsedCounter: number | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type ActiveAdminRecoveryCodeRecord =
  Readonly<{
    id: string;
    adminId: string;
    codeHash: string;
    createdAt: Date;
    usedAt: null;
    revokedAt: null;
  }>;

export type AdminCredentialRecord =
  LockedAdmin;

export type InsertAdminTotpFactorInput =
  Readonly<{
    adminId: string;
    secretCiphertext: Uint8Array;
    secretNonce: Uint8Array;
    secretAuthTag: Uint8Array;
    keyVersion: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type InsertAdminRecoveryCodeInput =
  Readonly<{
    adminId: string;
    codeHash: string;
    createdAt: Date;
  }>;

export type AuthPersistenceTransaction =
  Readonly<{
    getAuthThrottleState: (
      scope: AuthThrottleScope,
      keyHash: string,
    ) => Promise<
      AuthThrottleState | null
    >;

    recordAuthThrottleFailure: (
      scope: AuthThrottleScope,
      keyHash: string,
      now: Date,
    ) => Promise<
      RecordAuthThrottleFailureResult
    >;

    resetAuthThrottle: (
      scope: AuthThrottleScope,
      keyHash: string,
      now: Date,
    ) => Promise<void>;

    lockAdminForAuth: (
      adminId: string,
    ) => Promise<
      LockedAdmin | null
    >;

    lockLoginChallengeByTokenHash: (
      tokenHash: string,
    ) => Promise<
      LoginChallengeRecord | null
    >;

    invalidateActiveLoginChallenge: (
      adminId: string,
      invalidatedAt: Date,
    ) => Promise<void>;

    insertLoginChallenge: (
      input:
        InsertLoginChallengeInput,
    ) => Promise<
      LoginChallengeRecord
    >;

    applyLoginChallengeFailure: (
      challengeId: string,
      transition:
        ChallengeFailureTransition,
    ) => Promise<boolean>;

    consumeLoginChallenge: (
      challengeId: string,
      consumedAt: Date,
    ) => Promise<boolean>;

    insertAdminSession: (
      input:
        InsertAdminSessionInput,
    ) => Promise<
      AdminSessionRecord
    >;

    getAdminSessionAdminIdByTokenHash: (
      tokenHash: string,
    ) => Promise<string | null>;
    lockAdminSessionByTokenHash: (
      tokenHash: string,
    ) => Promise<
      AdminSessionRecord | null
    >;

    touchAdminSession: (
      sessionId: string,
      expectedLastSeenAt: Date,
      lastSeenAt: Date,
      idleExpiresAt: Date,
    ) => Promise<boolean>;

    revokeAdminSession: (
      sessionId: string,
      revokedAt: Date,
      reason:
        AdminSessionRevocationReason,
    ) => Promise<boolean>;

    revokeAllAdminSessions: (
      adminId: string,
      revokedAt: Date,
      reason:
        AdminSessionRevocationReason,
    ) => Promise<number>;

    setAdminLastLoginAt: (
      adminId: string,
      lastLoginAt: Date,
    ) => Promise<boolean>;

    lockAdminTotpFactorByAdminId: (
      adminId: string,
    ) => Promise<
      AdminTotpFactorRecord | null
    >;

    advanceConfirmedAdminTotpCounter: (
      factorId: string,
      expectedLastUsedCounter:
        number | null,
      nextCounter: number,
      updatedAt: Date,
    ) => Promise<boolean>;

    lockActiveRecoveryCodeByHash: (
      codeHash: string,
    ) => Promise<
      ActiveAdminRecoveryCodeRecord | null
    >;

    consumeRecoveryCode: (
      recoveryCodeId: string,
      usedAt: Date,
    ) => Promise<boolean>;

    insertAdminTotpFactor: (
      input:
        InsertAdminTotpFactorInput,
    ) => Promise<
      AdminTotpFactorRecord
    >;

    confirmAdminTotpFactor: (
      factorId: string,
      expectedUpdatedAt: Date,
      matchedCounter: number,
      confirmedAt: Date,
    ) => Promise<boolean>;

    insertAdminRecoveryCodes: (
      inputs:
        readonly InsertAdminRecoveryCodeInput[],
    ) => Promise<void>;
  }>;

type PersistedThrottleState =
  Readonly<{
    failureCount: number;
    windowStartedAt: Date;
    blockedUntil: Date | null;
  }>;

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

function assertSha256HexHash(
  value: string,
  name: string,
): void {
  if (
    !/^[0-9a-f]{64}$/.test(
      value,
    )
  ) {
    throw new Error(
      `${name} must be a lowercase SHA-256 hex hash.`,
    );
  }
}

function cloneDate(
  value: Date,
): Date {
  return new Date(
    value.getTime(),
  );
}

function mapThrottleState(
  row: PersistedThrottleState,
): AuthThrottleState {
  return {
    failureCount:
      row.failureCount,

    windowStartedAt:
      cloneDate(
        row.windowStartedAt,
      ),

    blockedUntil:
      row.blockedUntil
        ? cloneDate(
            row.blockedUntil,
          )
        : null,
  };
}

function mapLockedAdmin(
  row: {
    id: string;
    email: string;
    passwordHash: string;
    isActive: boolean;
    passwordChangedAt: Date;
    lastLoginAt: Date | null;
  },
): LockedAdmin {
  return {
    id: row.id,
    email: row.email,
    passwordHash:
      row.passwordHash,
    isActive:
      row.isActive,

    passwordChangedAt:
      cloneDate(
        row.passwordChangedAt,
      ),

    lastLoginAt:
      row.lastLoginAt
        ? cloneDate(
            row.lastLoginAt,
          )
        : null,
  };
}

function mapLoginChallengeRecord(
  row: {
    id: string;
    adminId: string;
    tokenHash: string;
    type: AdminLoginNext;
    attemptCount: number;
    expiresAt: Date;
    consumedAt: Date | null;
    invalidatedAt: Date | null;
    createdAt: Date;
  },
): LoginChallengeRecord {
  return {
    id: row.id,
    adminId: row.adminId,
    tokenHash: row.tokenHash,
    type: row.type,

    attemptCount:
      row.attemptCount,

    expiresAt:
      cloneDate(
        row.expiresAt,
      ),

    consumedAt:
      row.consumedAt
        ? cloneDate(
            row.consumedAt,
          )
        : null,

    invalidatedAt:
      row.invalidatedAt
        ? cloneDate(
            row.invalidatedAt,
          )
        : null,

    createdAt:
      cloneDate(
        row.createdAt,
      ),
  };
}

function assertAdminSessionAuthMethod(
  value: string,
): asserts value is AdminSessionAuthMethod {
  if (
    value !== 'totp' &&
    value !== 'recovery'
  ) {
    throw new Error(
      'Invalid admin session authentication method.',
    );
  }
}

function assertAdminSessionRevocationReason(
  value: string,
): asserts value is AdminSessionRevocationReason {
  if (
    !isAdminSessionRevocationReason(
      value,
    )
  ) {
    throw new Error(
      'Invalid admin session revocation reason.',
    );
  }
}

function assertAdminSessionTiming(
  timing: AdminSessionTiming,
): void {
  assertValidDate(
    timing.createdAt,
    'Admin session creation time',
  );

  assertValidDate(
    timing.lastSeenAt,
    'Admin session last-seen time',
  );

  assertValidDate(
    timing.idleExpiresAt,
    'Admin session idle expiry',
  );

  assertValidDate(
    timing.absoluteExpiresAt,
    'Admin session absolute expiry',
  );

  if (
    timing.lastSeenAt.getTime() <
    timing.createdAt.getTime()
  ) {
    throw new Error(
      'Admin session last-seen time must not precede creation time.',
    );
  }

  if (
    timing.idleExpiresAt.getTime() <=
    timing.createdAt.getTime()
  ) {
    throw new Error(
      'Admin session idle expiry must follow creation time.',
    );
  }

  if (
    timing.absoluteExpiresAt.getTime() <=
    timing.createdAt.getTime()
  ) {
    throw new Error(
      'Admin session absolute expiry must follow creation time.',
    );
  }

  if (
    timing.idleExpiresAt.getTime() >
    timing.absoluteExpiresAt.getTime()
  ) {
    throw new Error(
      'Admin session idle expiry must not exceed absolute expiry.',
    );
  }

  if (
    timing.lastSeenAt.getTime() >=
    timing.idleExpiresAt.getTime()
  ) {
    throw new Error(
      'Admin session last-seen time must precede idle expiry.',
    );
  }
}

function mapAdminSessionRecord(
  row: {
    id: string;
    adminId: string;
    authMethod: string;
    createdAt: Date;
    lastSeenAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    revokedAt: Date | null;
    revocationReason:
      string | null;
  },
): AdminSessionRecord {
  assertAdminSessionAuthMethod(
    row.authMethod,
  );

  if (
    row.revocationReason !== null
  ) {
    assertAdminSessionRevocationReason(
      row.revocationReason,
    );
  }

  if (
    (
      row.revokedAt === null
    ) !==
    (
      row.revocationReason === null
    )
  ) {
    throw new Error(
      'Persisted admin session has an invalid revocation state.',
    );
  }

  return {
    id:
      row.id,

    adminId:
      row.adminId,

    authMethod:
      row.authMethod,

    createdAt:
      cloneDate(
        row.createdAt,
      ),

    lastSeenAt:
      cloneDate(
        row.lastSeenAt,
      ),

    idleExpiresAt:
      cloneDate(
        row.idleExpiresAt,
      ),

    absoluteExpiresAt:
      cloneDate(
        row.absoluteExpiresAt,
      ),

    revokedAt:
      row.revokedAt
        ? cloneDate(
            row.revokedAt,
          )
        : null,

    revocationReason:
      row.revocationReason,
  };
}

function cloneBytes(
  value: Uint8Array,
): Uint8Array {
  return new Uint8Array(
    value,
  );
}

function assertTotpCounter(
  value: number,
  name: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      `${name} must be a non-negative safe integer.`,
    );
  }
}

function mapAdminTotpFactorRecord(
  row: {
    id: string;
    adminId: string;
    secretCiphertext: Uint8Array;
    secretNonce: Uint8Array;
    secretAuthTag: Uint8Array;
    keyVersion: number;
    lastUsedCounter: number | null;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
): AdminTotpFactorRecord {
  if (
    row.secretCiphertext.byteLength ===
    0
  ) {
    throw new Error(
      'Persisted TOTP ciphertext must not be empty.',
    );
  }

  if (
    row.secretNonce.byteLength !== 12
  ) {
    throw new Error(
      'Persisted TOTP nonce must be 12 bytes.',
    );
  }

  if (
    row.secretAuthTag.byteLength !== 16
  ) {
    throw new Error(
      'Persisted TOTP authentication tag must be 16 bytes.',
    );
  }

  if (
    !Number.isSafeInteger(
      row.keyVersion,
    ) ||
    row.keyVersion < 1
  ) {
    throw new Error(
      'Persisted TOTP key version must be a positive safe integer.',
    );
  }

  if (
    row.lastUsedCounter !== null
  ) {
    assertTotpCounter(
      row.lastUsedCounter,
      'Persisted TOTP last-used counter',
    );
  }

  assertValidDate(
    row.createdAt,
    'Persisted TOTP creation time',
  );

  assertValidDate(
    row.updatedAt,
    'Persisted TOTP update time',
  );

  if (
    row.confirmedAt !== null
  ) {
    assertValidDate(
      row.confirmedAt,
      'Persisted TOTP confirmation time',
    );

    if (
      row.confirmedAt.getTime() <
      row.createdAt.getTime()
    ) {
      throw new Error(
        'Persisted TOTP confirmation time must not precede creation time.',
      );
    }
  }

  return {
    id:
      row.id,

    adminId:
      row.adminId,

    secretCiphertext:
      cloneBytes(
        row.secretCiphertext,
      ),

    secretNonce:
      cloneBytes(
        row.secretNonce,
      ),

    secretAuthTag:
      cloneBytes(
        row.secretAuthTag,
      ),

    keyVersion:
      row.keyVersion,

    lastUsedCounter:
      row.lastUsedCounter,

    confirmedAt:
      row.confirmedAt
        ? cloneDate(
            row.confirmedAt,
          )
        : null,

    createdAt:
      cloneDate(
        row.createdAt,
      ),

    updatedAt:
      cloneDate(
        row.updatedAt,
      ),
  };
}

function mapActiveRecoveryCodeRecord(
  row: {
    id: string;
    adminId: string;
    codeHash: string;
    createdAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
  },
): ActiveAdminRecoveryCodeRecord {
  assertSha256HexHash(
    row.codeHash,
    'Persisted recovery-code hash',
  );

  assertValidDate(
    row.createdAt,
    'Persisted recovery-code creation time',
  );

  if (
    row.usedAt !== null ||
    row.revokedAt !== null
  ) {
    throw new Error(
      'Persisted recovery code is not active.',
    );
  }

  return {
    id:
      row.id,

    adminId:
      row.adminId,

    codeHash:
      row.codeHash,

    createdAt:
      cloneDate(
        row.createdAt,
      ),

    usedAt:
      null,

    revokedAt:
      null,
  };
}

function assertCanonicalAdminEmail(
  value: string,
): void {
  if (
    !isAdminEmailInputValid(
      value,
    ) ||
    canonicalizeAdminEmail(
      value,
    ) !== value
  ) {
    throw new Error(
      'Admin email must be canonical and valid.',
    );
  }
}

function assertNonEmptyString(
  value: string,
  name: string,
): void {
  if (value.length === 0) {
    throw new Error(
      `${name} must be non-empty.`,
    );
  }
}

function assertInsertAdminTotpFactorInput(
  input:
    InsertAdminTotpFactorInput,
): void {
  assertNonEmptyString(
    input.adminId,
    'Admin ID',
  );

  if (
    !(
      input.secretCiphertext
        instanceof Uint8Array
    ) ||
    input.secretCiphertext
      .byteLength === 0
  ) {
    throw new Error(
      'TOTP ciphertext must be a non-empty byte array.',
    );
  }

  if (
    !(
      input.secretNonce
        instanceof Uint8Array
    ) ||
    input.secretNonce
      .byteLength !== 12
  ) {
    throw new Error(
      'TOTP nonce must be exactly 12 bytes.',
    );
  }

  if (
    !(
      input.secretAuthTag
        instanceof Uint8Array
    ) ||
    input.secretAuthTag
      .byteLength !== 16
  ) {
    throw new Error(
      'TOTP authentication tag must be exactly 16 bytes.',
    );
  }

  if (
    !Number.isSafeInteger(
      input.keyVersion,
    ) ||
    input.keyVersion < 1
  ) {
    throw new Error(
      'TOTP key version must be a positive safe integer.',
    );
  }

  assertValidDate(
    input.createdAt,
    'TOTP factor creation time',
  );

  assertValidDate(
    input.updatedAt,
    'TOTP factor update time',
  );

  if (
    input.updatedAt.getTime() <
    input.createdAt.getTime()
  ) {
    throw new Error(
      'TOTP factor update time must not precede creation time.',
    );
  }
}
export async function runAuthTransaction<T>(
  operation: (
    tx: AuthPersistenceTransaction,
  ) => Promise<T>,
): Promise<T> {
  const database =
    getDatabase();

  return database.transaction(
    async (tx) => {
      const authTx:
        AuthPersistenceTransaction = {
          async getAuthThrottleState(
            scope,
            keyHash,
          ) {
            assertSha256HexHash(
              keyHash,
              'Auth throttle key hash',
            );

            const rows =
              await tx
                .select({
                  failureCount:
                    adminAuthThrottles
                      .failureCount,

                  windowStartedAt:
                    adminAuthThrottles
                      .windowStartedAt,

                  blockedUntil:
                    adminAuthThrottles
                      .blockedUntil,
                })
                .from(
                  adminAuthThrottles,
                )
                .where(
                  and(
                    eq(
                      adminAuthThrottles
                        .scope,
                      scope,
                    ),
                    eq(
                      adminAuthThrottles
                        .keyHash,
                      keyHash,
                    ),
                  ),
                )
                .limit(1);

            const row =
              rows[0];

            return row
              ? mapThrottleState(
                  row,
                )
              : null;
          },

          async recordAuthThrottleFailure(
            scope,
            keyHash,
            now,
          ) {
            assertSha256HexHash(
              keyHash,
              'Auth throttle key hash',
            );

            assertValidDate(
              now,
              'Auth throttle failure time',
            );

            const timestamp =
              cloneDate(now);

            /*
             * Materialize the composite-key row first.
             *
             * PostgreSQL serializes concurrent inserts
             * that target the same primary key. After
             * this statement completes, the following
             * SELECT FOR UPDATE can safely lock the one
             * canonical throttle row.
             */
            await tx
              .insert(
                adminAuthThrottles,
              )
              .values({
                scope,
                keyHash,

                failureCount: 0,

                windowStartedAt:
                  cloneDate(
                    timestamp,
                  ),

                lastFailureAt: null,
                blockedUntil: null,

                createdAt:
                  cloneDate(
                    timestamp,
                  ),

                updatedAt:
                  cloneDate(
                    timestamp,
                  ),
              })
              .onConflictDoNothing();

            const rows =
              await tx
                .select({
                  failureCount:
                    adminAuthThrottles
                      .failureCount,

                  windowStartedAt:
                    adminAuthThrottles
                      .windowStartedAt,

                  blockedUntil:
                    adminAuthThrottles
                      .blockedUntil,
                })
                .from(
                  adminAuthThrottles,
                )
                .where(
                  and(
                    eq(
                      adminAuthThrottles
                        .scope,
                      scope,
                    ),
                    eq(
                      adminAuthThrottles
                        .keyHash,
                      keyHash,
                    ),
                  ),
                )
                .for('update')
                .limit(1);

            const row =
              rows[0];

            if (!row) {
              throw new Error(
                'Auth throttle row disappeared during a locked transaction.',
              );
            }

            const state =
              mapThrottleState(
                row,
              );

            if (
              isAuthThrottleBlocked(
                state,
                timestamp,
              )
            ) {
              return {
                blocked: true,
                state,
              };
            }

            const transition =
              transitionAuthThrottleFailure(
                scope,
                state,
                timestamp,
              );

            await tx
              .update(
                adminAuthThrottles,
              )
              .set({
                failureCount:
                  transition
                    .failureCount,

                windowStartedAt:
                  cloneDate(
                    transition
                      .windowStartedAt,
                  ),

                lastFailureAt:
                  cloneDate(
                    transition
                      .lastFailureAt,
                  ),

                blockedUntil:
                  transition
                    .blockedUntil
                    ? cloneDate(
                        transition
                          .blockedUntil,
                      )
                    : null,

                updatedAt:
                  cloneDate(
                    timestamp,
                  ),
              })
              .where(
                and(
                  eq(
                    adminAuthThrottles
                      .scope,
                    scope,
                  ),
                  eq(
                    adminAuthThrottles
                      .keyHash,
                    keyHash,
                  ),
                ),
              );

            return {
              blocked: false,
              state:
                transition,
            };
          },

          async resetAuthThrottle(
            scope,
            keyHash,
            now,
          ) {
            assertSha256HexHash(
              keyHash,
              'Auth throttle key hash',
            );

            const resetState =
              resetAuthThrottleState(
                now,
              );

            await tx
              .update(
                adminAuthThrottles,
              )
              .set({
                failureCount:
                  resetState
                    .failureCount,

                windowStartedAt:
                  cloneDate(
                    resetState
                      .windowStartedAt,
                  ),

                lastFailureAt:
                  resetState
                    .lastFailureAt,

                blockedUntil:
                  resetState
                    .blockedUntil,

                updatedAt:
                  cloneDate(now),
              })
              .where(
                and(
                  eq(
                    adminAuthThrottles
                      .scope,
                    scope,
                  ),
                  eq(
                    adminAuthThrottles
                      .keyHash,
                    keyHash,
                  ),
                ),
              );
          },
          async lockAdminForAuth(
            adminId,
          ) {
            const rows =
              await tx
                .select({
                  id:
                    admins.id,

                  email:
                    admins.email,

                  passwordHash:
                    admins.passwordHash,

                  isActive:
                    admins.isActive,

                  passwordChangedAt:
                    admins
                      .passwordChangedAt,

                  lastLoginAt:
                    admins.lastLoginAt,
                })
                .from(
                  admins,
                )
                .where(
                  eq(
                    admins.id,
                    adminId,
                  ),
                )
                .for('update')
                .limit(1);

            const row =
              rows[0];

            return row
              ? mapLockedAdmin(
                  row,
                )
              : null;
          },

          async lockLoginChallengeByTokenHash(
            tokenHash,
          ) {
            assertSha256HexHash(
              tokenHash,
              'Login challenge token hash',
            );

            const rows =
              await tx
                .select({
                  id:
                    adminLoginChallenges
                      .id,

                  adminId:
                    adminLoginChallenges
                      .adminId,

                  tokenHash:
                    adminLoginChallenges
                      .tokenHash,

                  type:
                    adminLoginChallenges
                      .type,

                  attemptCount:
                    adminLoginChallenges
                      .attemptCount,

                  expiresAt:
                    adminLoginChallenges
                      .expiresAt,

                  consumedAt:
                    adminLoginChallenges
                      .consumedAt,

                  invalidatedAt:
                    adminLoginChallenges
                      .invalidatedAt,

                  createdAt:
                    adminLoginChallenges
                      .createdAt,
                })
                .from(
                  adminLoginChallenges,
                )
                .where(
                  eq(
                    adminLoginChallenges
                      .tokenHash,
                    tokenHash,
                  ),
                )
                .for('update')
                .limit(1);

            const row =
              rows[0];

            return row
              ? mapLoginChallengeRecord(
                  row,
                )
              : null;
          },

          async invalidateActiveLoginChallenge(
            adminId,
            invalidatedAt,
          ) {
            assertValidDate(
              invalidatedAt,
              'Login challenge invalidation time',
            );

            await tx
              .update(
                adminLoginChallenges,
              )
              .set({
                invalidatedAt:
                  cloneDate(
                    invalidatedAt,
                  ),
              })
              .where(
                and(
                  eq(
                    adminLoginChallenges
                      .adminId,
                    adminId,
                  ),
                  isNull(
                    adminLoginChallenges
                      .consumedAt,
                  ),
                  isNull(
                    adminLoginChallenges
                      .invalidatedAt,
                  ),
                ),
              );
          },

          async insertLoginChallenge(
            input,
          ) {
            assertSha256HexHash(
              input.tokenHash,
              'Login challenge token hash',
            );

            assertValidDate(
              input.createdAt,
              'Login challenge creation time',
            );

            assertValidDate(
              input.expiresAt,
              'Login challenge expiry time',
            );

            if (
              input.expiresAt.getTime() <=
              input.createdAt.getTime()
            ) {
              throw new Error(
                'Login challenge expiry must be after creation time.',
              );
            }

            const rows =
              await tx
                .insert(
                  adminLoginChallenges,
                )
                .values({
                  adminId:
                    input.adminId,

                  tokenHash:
                    input.tokenHash,

                  type:
                    input.type,

                  attemptCount: 0,

                  expiresAt:
                    cloneDate(
                      input.expiresAt,
                    ),

                  consumedAt: null,
                  invalidatedAt: null,

                  createdAt:
                    cloneDate(
                      input.createdAt,
                    ),
                })
                .returning({
                  id:
                    adminLoginChallenges
                      .id,

                  adminId:
                    adminLoginChallenges
                      .adminId,

                  tokenHash:
                    adminLoginChallenges
                      .tokenHash,

                  type:
                    adminLoginChallenges
                      .type,

                  attemptCount:
                    adminLoginChallenges
                      .attemptCount,

                  expiresAt:
                    adminLoginChallenges
                      .expiresAt,

                  consumedAt:
                    adminLoginChallenges
                      .consumedAt,

                  invalidatedAt:
                    adminLoginChallenges
                      .invalidatedAt,

                  createdAt:
                    adminLoginChallenges
                      .createdAt,
                });

            const row =
              rows[0];

            if (!row) {
              throw new Error(
                'Login challenge insert did not return a row.',
              );
            }

            return (
              mapLoginChallengeRecord(
                row,
              )
            );
          },

          async applyLoginChallengeFailure(
            challengeId,
            transition,
          ) {
            if (
              !Number.isSafeInteger(
                transition.attemptCount,
              ) ||
              transition.attemptCount < 1
            ) {
              throw new Error(
                'Login challenge failure transition has an invalid attempt count.',
              );
            }

            if (
              transition.invalidatedAt
            ) {
              assertValidDate(
                transition.invalidatedAt,
                'Login challenge invalidation time',
              );
            }

            const previousAttemptCount =
              transition.attemptCount - 1;

            const rows =
              await tx
                .update(
                  adminLoginChallenges,
                )
                .set({
                  attemptCount:
                    transition
                      .attemptCount,

                  invalidatedAt:
                    transition
                      .invalidatedAt
                      ? cloneDate(
                          transition
                            .invalidatedAt,
                        )
                      : null,
                })
                .where(
                  and(
                    eq(
                      adminLoginChallenges
                        .id,
                      challengeId,
                    ),
                    eq(
                      adminLoginChallenges
                        .attemptCount,
                      previousAttemptCount,
                    ),
                    isNull(
                      adminLoginChallenges
                        .consumedAt,
                    ),
                    isNull(
                      adminLoginChallenges
                        .invalidatedAt,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminLoginChallenges
                      .id,
                });

            return (
              rows.length === 1
            );
          },

          async consumeLoginChallenge(
            challengeId,
            consumedAt,
          ) {
            assertValidDate(
              consumedAt,
              'Login challenge consumption time',
            );

            const rows =
              await tx
                .update(
                  adminLoginChallenges,
                )
                .set({
                  consumedAt:
                    cloneDate(
                      consumedAt,
                    ),
                })
                .where(
                  and(
                    eq(
                      adminLoginChallenges
                        .id,
                      challengeId,
                    ),
                    isNull(
                      adminLoginChallenges
                        .consumedAt,
                    ),
                    isNull(
                      adminLoginChallenges
                        .invalidatedAt,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminLoginChallenges
                      .id,
                });

            return (
              rows.length === 1
            );
          },

          async insertAdminSession(
            input,
          ) {
            assertSha256HexHash(
              input.tokenHash,
              'Admin session token hash',
            );

            assertAdminSessionAuthMethod(
              input.authMethod,
            );

            assertAdminSessionTiming(
              input.timing,
            );

            const rows =
              await tx
                .insert(
                  adminSessions,
                )
                .values({
                  adminId:
                    input.adminId,

                  tokenHash:
                    input.tokenHash,

                  authMethod:
                    input.authMethod,

                  createdAt:
                    cloneDate(
                      input.timing
                        .createdAt,
                    ),

                  lastSeenAt:
                    cloneDate(
                      input.timing
                        .lastSeenAt,
                    ),

                  idleExpiresAt:
                    cloneDate(
                      input.timing
                        .idleExpiresAt,
                    ),

                  absoluteExpiresAt:
                    cloneDate(
                      input.timing
                        .absoluteExpiresAt,
                    ),

                  revokedAt:
                    null,

                  revocationReason:
                    null,
                })
                .returning({
                  id:
                    adminSessions.id,

                  adminId:
                    adminSessions.adminId,

                  authMethod:
                    adminSessions
                      .authMethod,

                  createdAt:
                    adminSessions.createdAt,

                  lastSeenAt:
                    adminSessions
                      .lastSeenAt,

                  idleExpiresAt:
                    adminSessions
                      .idleExpiresAt,

                  absoluteExpiresAt:
                    adminSessions
                      .absoluteExpiresAt,

                  revokedAt:
                    adminSessions.revokedAt,

                  revocationReason:
                    adminSessions
                      .revocationReason,
                });

            const row =
              rows[0];

            if (!row) {
              throw new Error(
                'Admin session insert did not return a row.',
              );
            }

            return mapAdminSessionRecord(
              row,
            );
          },

          async getAdminSessionAdminIdByTokenHash(
            tokenHash,
          ) {
            assertSha256HexHash(
              tokenHash,
              'Admin session token hash',
            );

            const rows =
              await tx
                .select({
                  adminId:
                    adminSessions.adminId,
                })
                .from(
                  adminSessions,
                )
                .where(
                  eq(
                    adminSessions
                      .tokenHash,
                    tokenHash,
                  ),
                )
                .limit(1);

            return (
              rows[0]?.adminId ??
              null
            );
          },
          async lockAdminSessionByTokenHash(
            tokenHash,
          ) {
            assertSha256HexHash(
              tokenHash,
              'Admin session token hash',
            );

            const rows =
              await tx
                .select({
                  id:
                    adminSessions.id,

                  adminId:
                    adminSessions.adminId,

                  authMethod:
                    adminSessions
                      .authMethod,

                  createdAt:
                    adminSessions.createdAt,

                  lastSeenAt:
                    adminSessions
                      .lastSeenAt,

                  idleExpiresAt:
                    adminSessions
                      .idleExpiresAt,

                  absoluteExpiresAt:
                    adminSessions
                      .absoluteExpiresAt,

                  revokedAt:
                    adminSessions.revokedAt,

                  revocationReason:
                    adminSessions
                      .revocationReason,
                })
                .from(
                  adminSessions,
                )
                .where(
                  eq(
                    adminSessions
                      .tokenHash,
                    tokenHash,
                  ),
                )
                .for('update')
                .limit(1);

            const row =
              rows[0];

            return row
              ? mapAdminSessionRecord(
                  row,
                )
              : null;
          },

          async touchAdminSession(
            sessionId,
            expectedLastSeenAt,
            lastSeenAt,
            idleExpiresAt,
          ) {
            assertValidDate(
              expectedLastSeenAt,
              'Expected admin session last-seen time',
            );

            assertValidDate(
              lastSeenAt,
              'Admin session touch time',
            );

            assertValidDate(
              idleExpiresAt,
              'Touched admin session idle expiry',
            );

            if (
              lastSeenAt.getTime() <=
              expectedLastSeenAt.getTime()
            ) {
              throw new Error(
                'Admin session touch time must follow the expected last-seen time.',
              );
            }

            if (
              idleExpiresAt.getTime() <=
              lastSeenAt.getTime()
            ) {
              throw new Error(
                'Touched admin session idle expiry must follow the touch time.',
              );
            }

            const rows =
              await tx
                .update(
                  adminSessions,
                )
                .set({
                  lastSeenAt:
                    cloneDate(
                      lastSeenAt,
                    ),

                  idleExpiresAt:
                    cloneDate(
                      idleExpiresAt,
                    ),
                })
                .where(
                  and(
                    eq(
                      adminSessions.id,
                      sessionId,
                    ),
                    eq(
                      adminSessions
                        .lastSeenAt,
                      expectedLastSeenAt,
                    ),
                    isNull(
                      adminSessions
                        .revokedAt,
                    ),
                    isNull(
                      adminSessions
                        .revocationReason,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminSessions.id,
                });

            return (
              rows.length === 1
            );
          },

          async revokeAdminSession(
            sessionId,
            revokedAt,
            reason,
          ) {
            assertValidDate(
              revokedAt,
              'Admin session revocation time',
            );

            assertAdminSessionRevocationReason(
              reason,
            );

            const rows =
              await tx
                .update(
                  adminSessions,
                )
                .set({
                  revokedAt:
                    cloneDate(
                      revokedAt,
                    ),

                  revocationReason:
                    reason,
                })
                .where(
                  and(
                    eq(
                      adminSessions.id,
                      sessionId,
                    ),
                    isNull(
                      adminSessions
                        .revokedAt,
                    ),
                    isNull(
                      adminSessions
                        .revocationReason,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminSessions.id,
                });

            return (
              rows.length === 1
            );
          },

          async revokeAllAdminSessions(
            adminId,
            revokedAt,
            reason,
          ) {
            assertValidDate(
              revokedAt,
              'Admin session bulk revocation time',
            );

            assertAdminSessionRevocationReason(
              reason,
            );

            const rows =
              await tx
                .update(
                  adminSessions,
                )
                .set({
                  revokedAt:
                    cloneDate(
                      revokedAt,
                    ),

                  revocationReason:
                    reason,
                })
                .where(
                  and(
                    eq(
                      adminSessions
                        .adminId,
                      adminId,
                    ),
                    isNull(
                      adminSessions
                        .revokedAt,
                    ),
                    isNull(
                      adminSessions
                        .revocationReason,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminSessions.id,
                });

            return rows.length;
          },

          async setAdminLastLoginAt(
            adminId,
            lastLoginAt,
          ) {
            assertValidDate(
              lastLoginAt,
              'Admin last-login time',
            );

            const rows =
              await tx
                .update(
                  admins,
                )
                .set({
                  lastLoginAt:
                    cloneDate(
                      lastLoginAt,
                    ),
                })
                .where(
                  and(
                    eq(
                      admins.id,
                      adminId,
                    ),
                    eq(
                      admins.isActive,
                      true,
                    ),
                  ),
                )
                .returning({
                  id:
                    admins.id,
                });

            return (
              rows.length === 1
            );
          },

          async lockAdminTotpFactorByAdminId(
            adminId,
          ) {
            const rows =
              await tx
                .select({
                  id:
                    adminTotpFactors.id,

                  adminId:
                    adminTotpFactors
                      .adminId,

                  secretCiphertext:
                    adminTotpFactors
                      .secretCiphertext,

                  secretNonce:
                    adminTotpFactors
                      .secretNonce,

                  secretAuthTag:
                    adminTotpFactors
                      .secretAuthTag,

                  keyVersion:
                    adminTotpFactors
                      .keyVersion,

                  lastUsedCounter:
                    adminTotpFactors
                      .lastUsedCounter,

                  confirmedAt:
                    adminTotpFactors
                      .confirmedAt,

                  createdAt:
                    adminTotpFactors
                      .createdAt,

                  updatedAt:
                    adminTotpFactors
                      .updatedAt,
                })
                .from(
                  adminTotpFactors,
                )
                .where(
                  eq(
                    adminTotpFactors
                      .adminId,
                    adminId,
                  ),
                )
                .for('update')
                .limit(1);

            const row =
              rows[0];

            return row
              ? mapAdminTotpFactorRecord(
                  row,
                )
              : null;
          },

          async advanceConfirmedAdminTotpCounter(
            factorId,
            expectedLastUsedCounter,
            nextCounter,
            updatedAt,
          ) {
            if (
              expectedLastUsedCounter !==
              null
            ) {
              assertTotpCounter(
                expectedLastUsedCounter,
                'Expected TOTP last-used counter',
              );
            }

            assertTotpCounter(
              nextCounter,
              'Next TOTP counter',
            );

            assertValidDate(
              updatedAt,
              'TOTP counter update time',
            );

            if (
              expectedLastUsedCounter !==
                null &&
              nextCounter <=
                expectedLastUsedCounter
            ) {
              throw new Error(
                'Next TOTP counter must exceed the expected last-used counter.',
              );
            }

            const counterGuard =
              expectedLastUsedCounter ===
              null
                ? isNull(
                    adminTotpFactors
                      .lastUsedCounter,
                  )
                : eq(
                    adminTotpFactors
                      .lastUsedCounter,
                    expectedLastUsedCounter,
                  );

            const rows =
              await tx
                .update(
                  adminTotpFactors,
                )
                .set({
                  lastUsedCounter:
                    nextCounter,

                  updatedAt:
                    cloneDate(
                      updatedAt,
                    ),
                })
                .where(
                  and(
                    eq(
                      adminTotpFactors.id,
                      factorId,
                    ),
                    isNotNull(
                      adminTotpFactors
                        .confirmedAt,
                    ),
                    counterGuard,
                  ),
                )
                .returning({
                  id:
                    adminTotpFactors.id,
                });

            return (
              rows.length === 1
            );
          },

          async lockActiveRecoveryCodeByHash(
            codeHash,
          ) {
            assertSha256HexHash(
              codeHash,
              'Recovery-code hash',
            );

            const rows =
              await tx
                .select({
                  id:
                    adminRecoveryCodes.id,

                  adminId:
                    adminRecoveryCodes
                      .adminId,

                  codeHash:
                    adminRecoveryCodes
                      .codeHash,

                  createdAt:
                    adminRecoveryCodes
                      .createdAt,

                  usedAt:
                    adminRecoveryCodes
                      .usedAt,

                  revokedAt:
                    adminRecoveryCodes
                      .revokedAt,
                })
                .from(
                  adminRecoveryCodes,
                )
                .where(
                  and(
                    eq(
                      adminRecoveryCodes
                        .codeHash,
                      codeHash,
                    ),
                    isNull(
                      adminRecoveryCodes
                        .usedAt,
                    ),
                    isNull(
                      adminRecoveryCodes
                        .revokedAt,
                    ),
                  ),
                )
                .for('update')
                .limit(1);

            const row =
              rows[0];

            return row
              ? mapActiveRecoveryCodeRecord(
                  row,
                )
              : null;
          },

          async consumeRecoveryCode(
            recoveryCodeId,
            usedAt,
          ) {
            assertValidDate(
              usedAt,
              'Recovery-code consumption time',
            );

            const rows =
              await tx
                .update(
                  adminRecoveryCodes,
                )
                .set({
                  usedAt:
                    cloneDate(
                      usedAt,
                    ),
                })
                .where(
                  and(
                    eq(
                      adminRecoveryCodes.id,
                      recoveryCodeId,
                    ),
                    isNull(
                      adminRecoveryCodes
                        .usedAt,
                    ),
                    isNull(
                      adminRecoveryCodes
                        .revokedAt,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminRecoveryCodes.id,
                });

            return (
              rows.length === 1
            );
          },

          async insertAdminTotpFactor(
            input,
          ) {
            assertInsertAdminTotpFactorInput(
              input,
            );

            const rows =
              await tx
                .insert(
                  adminTotpFactors,
                )
                .values({
                  adminId:
                    input.adminId,

                  secretCiphertext:
                    cloneBytes(
                      input.secretCiphertext,
                    ),

                  secretNonce:
                    cloneBytes(
                      input.secretNonce,
                    ),

                  secretAuthTag:
                    cloneBytes(
                      input.secretAuthTag,
                    ),

                  keyVersion:
                    input.keyVersion,

                  lastUsedCounter:
                    null,

                  confirmedAt:
                    null,

                  createdAt:
                    cloneDate(
                      input.createdAt,
                    ),

                  updatedAt:
                    cloneDate(
                      input.updatedAt,
                    ),
                })
                .returning({
                  id:
                    adminTotpFactors.id,

                  adminId:
                    adminTotpFactors
                      .adminId,

                  secretCiphertext:
                    adminTotpFactors
                      .secretCiphertext,

                  secretNonce:
                    adminTotpFactors
                      .secretNonce,

                  secretAuthTag:
                    adminTotpFactors
                      .secretAuthTag,

                  keyVersion:
                    adminTotpFactors
                      .keyVersion,

                  lastUsedCounter:
                    adminTotpFactors
                      .lastUsedCounter,

                  confirmedAt:
                    adminTotpFactors
                      .confirmedAt,

                  createdAt:
                    adminTotpFactors
                      .createdAt,

                  updatedAt:
                    adminTotpFactors
                      .updatedAt,
                });

            const row =
              rows[0];

            if (!row) {
              throw new Error(
                'TOTP factor insert did not return a persisted row.',
              );
            }

            return (
              mapAdminTotpFactorRecord(
                row,
              )
            );
          },

          async confirmAdminTotpFactor(
            factorId,
            expectedUpdatedAt,
            matchedCounter,
            confirmedAt,
          ) {
            assertNonEmptyString(
              factorId,
              'TOTP factor ID',
            );

            assertValidDate(
              expectedUpdatedAt,
              'Expected TOTP factor update time',
            );

            assertTotpCounter(
              matchedCounter,
              'Matched TOTP counter',
            );

            assertValidDate(
              confirmedAt,
              'TOTP factor confirmation time',
            );

            if (
              confirmedAt.getTime() <
              expectedUpdatedAt.getTime()
            ) {
              throw new Error(
                'TOTP confirmation time must not precede the expected factor state.',
              );
            }

            const rows =
              await tx
                .update(
                  adminTotpFactors,
                )
                .set({
                  lastUsedCounter:
                    matchedCounter,

                  confirmedAt:
                    cloneDate(
                      confirmedAt,
                    ),

                  updatedAt:
                    cloneDate(
                      confirmedAt,
                    ),
                })
                .where(
                  and(
                    eq(
                      adminTotpFactors.id,
                      factorId,
                    ),
                    eq(
                      adminTotpFactors
                        .updatedAt,
                      expectedUpdatedAt,
                    ),
                    isNull(
                      adminTotpFactors
                        .confirmedAt,
                    ),
                    isNull(
                      adminTotpFactors
                        .lastUsedCounter,
                    ),
                  ),
                )
                .returning({
                  id:
                    adminTotpFactors.id,
                });

            return (
              rows.length === 1
            );
          },

          async insertAdminRecoveryCodes(
            inputs,
          ) {
            if (inputs.length !== 10) {
              throw new Error(
                'Recovery-code provisioning requires exactly ten hashes.',
              );
            }

            const first =
              inputs[0];

            if (!first) {
              throw new Error(
                'Recovery-code provisioning input is empty.',
              );
            }

            assertNonEmptyString(
              first.adminId,
              'Recovery-code admin ID',
            );

            const seenHashes =
              new Set<string>();

            const values =
              inputs.map(
                (input) => {
                  if (
                    input.adminId !==
                    first.adminId
                  ) {
                    throw new Error(
                      'All recovery codes must belong to the same admin.',
                    );
                  }

                  assertSha256HexHash(
                    input.codeHash,
                    'Recovery-code hash',
                  );

                  if (
                    seenHashes.has(
                      input.codeHash,
                    )
                  ) {
                    throw new Error(
                      'Recovery-code hashes must be unique.',
                    );
                  }

                  seenHashes.add(
                    input.codeHash,
                  );

                  assertValidDate(
                    input.createdAt,
                    'Recovery-code creation time',
                  );

                  return {
                    adminId:
                      input.adminId,

                    codeHash:
                      input.codeHash,

                    createdAt:
                      cloneDate(
                        input.createdAt,
                      ),

                    usedAt:
                      null,

                    revokedAt:
                      null,
                  };
                },
              );

            await tx
              .insert(
                adminRecoveryCodes,
              )
              .values(
                values,
              );
          },
        };

      return operation(
        authTx,
      );
    },
  );
}

export async function getAdminByCanonicalEmail(
  email: string,
): Promise<
  AdminCredentialRecord | null
> {
  assertCanonicalAdminEmail(
    email,
  );

  const rows =
    await getDatabase()
      .select({
        id:
          admins.id,

        email:
          admins.email,

        passwordHash:
          admins.passwordHash,

        isActive:
          admins.isActive,

        passwordChangedAt:
          admins.passwordChangedAt,

        lastLoginAt:
          admins.lastLoginAt,
      })
      .from(
        admins,
      )
      .where(
        eq(
          admins.email,
          email,
        ),
      )
      .limit(1);

  const row =
    rows[0];

  return row
    ? mapLockedAdmin(
        row,
      )
    : null;
}

export async function updateAdminPasswordHashIfCurrent(
  adminId: string,
  expectedPasswordHash: string,
  replacementPasswordHash: string,
  updatedAt: Date,
): Promise<boolean> {
  assertNonEmptyString(
    adminId,
    'Admin ID',
  );

  assertNonEmptyString(
    expectedPasswordHash,
    'Expected admin password hash',
  );

  assertNonEmptyString(
    replacementPasswordHash,
    'Replacement admin password hash',
  );

  assertValidDate(
    updatedAt,
    'Password rehash update time',
  );

  const rows =
    await getDatabase()
      .update(
        admins,
      )
      .set({
        passwordHash:
          replacementPasswordHash,

        updatedAt:
          cloneDate(
            updatedAt,
          ),
      })
      .where(
        and(
          eq(
            admins.id,
            adminId,
          ),
          eq(
            admins.passwordHash,
            expectedPasswordHash,
          ),
          eq(
            admins.isActive,
            true,
          ),
        ),
      )
      .returning({
        id:
          admins.id,
      });

  return (
    rows.length === 1
  );
}
export async function getAuthThrottleState(
  scope: AuthThrottleScope,
  keyHash: string,
): Promise<
  AuthThrottleState | null
> {
  assertSha256HexHash(
    keyHash,
    'Auth throttle key hash',
  );

  const rows =
    await getDatabase()
      .select({
        failureCount:
          adminAuthThrottles
            .failureCount,

        windowStartedAt:
          adminAuthThrottles
            .windowStartedAt,

        blockedUntil:
          adminAuthThrottles
            .blockedUntil,
      })
      .from(
        adminAuthThrottles,
      )
      .where(
        and(
          eq(
            adminAuthThrottles
              .scope,
            scope,
          ),
          eq(
            adminAuthThrottles
              .keyHash,
            keyHash,
          ),
        ),
      )
      .limit(1);

  const row =
    rows[0];

  return row
    ? mapThrottleState(
        row,
      )
    : null;
}

export async function recordAuthThrottleFailure(
  scope: AuthThrottleScope,
  keyHash: string,
  now: Date,
): Promise<
  RecordAuthThrottleFailureResult
> {
  return runAuthTransaction(
    (tx) =>
      tx.recordAuthThrottleFailure(
        scope,
        keyHash,
        now,
      ),
  );
}

export async function resetAuthThrottle(
  scope: AuthThrottleScope,
  keyHash: string,
  now: Date,
): Promise<void> {
  return runAuthTransaction(
    (tx) =>
      tx.resetAuthThrottle(
        scope,
        keyHash,
        now,
      ),
  );
}