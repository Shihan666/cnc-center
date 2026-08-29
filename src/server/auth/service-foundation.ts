import { Buffer } from 'node:buffer';

import type {
  AuthThrottleScope,
} from './hmac.ts';

import {
  ADMIN_AUTH_THROTTLE_POLICIES,
  ADMIN_EMAIL_MAX_LENGTH,
  ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS,
  ADMIN_LOGIN_CHALLENGE_TTL_MS,
  ADMIN_PASSWORD_MAX_UTF8_BYTES,
  ADMIN_SESSION_ABSOLUTE_TTL_MS,
  ADMIN_SESSION_IDLE_TTL_MS,
  ADMIN_SESSION_REVOCATION_REASONS,
  ADMIN_SESSION_TOUCH_INTERVAL_MS,
  type AdminAuthThrottlePolicy,
  type AdminSessionRevocationReason,
} from './service-contract.ts';

export type AuthThrottleState =
  Readonly<{
    failureCount: number;
    windowStartedAt: Date;
    blockedUntil: Date | null;
  }>;

export type AuthThrottleFailureTransition =
  Readonly<{
    failureCount: number;
    windowStartedAt: Date;
    lastFailureAt: Date;
    blockedUntil: Date | null;
  }>;

export type AuthThrottleResetState =
  Readonly<{
    failureCount: 0;
    windowStartedAt: Date;
    lastFailureAt: null;
    blockedUntil: null;
  }>;

export type ChallengeFailureTransition =
  Readonly<{
    attemptCount: number;
    invalidatedAt: Date | null;
  }>;

export type ChallengeState =
  Readonly<{
    attemptCount: number;
    expiresAt: Date;
    consumedAt: Date | null;
    invalidatedAt: Date | null;
  }>;

export type AdminSessionTiming =
  Readonly<{
    createdAt: Date;
    lastSeenAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
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

function assertFailureCount(
  value: number,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      'Auth throttle failure count must be a non-negative safe integer.',
    );
  }
}

function assertChallengeAttemptCount(
  value: number,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value >
      ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS
  ) {
    throw new Error(
      'Login challenge attempt count is outside the allowed range.',
    );
  }
}

export function canonicalizeAdminEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

export function isAdminEmailInputValid(
  value: string,
): boolean {
  const canonical =
    canonicalizeAdminEmail(
      value,
    );

  return (
    canonical.length > 0 &&
    canonical.length <=
      ADMIN_EMAIL_MAX_LENGTH
  );
}

export function isAdminPasswordInputValid(
  value: string,
): boolean {
  const byteLength =
    Buffer.byteLength(
      value,
      'utf8',
    );

  return (
    byteLength > 0 &&
    byteLength <=
      ADMIN_PASSWORD_MAX_UTF8_BYTES
  );
}

export function requireCanonicalClientIp(
  value: string,
): string {
  if (
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(
      'Client IP must be a non-empty canonical value supplied by the transport layer.',
    );
  }

  return value;
}

export function getAdminAuthThrottlePolicy(
  scope: AuthThrottleScope,
): AdminAuthThrottlePolicy {
  return (
    ADMIN_AUTH_THROTTLE_POLICIES[
      scope
    ]
  );
}

export function isAuthThrottleBlocked(
  state: AuthThrottleState | null,
  now: Date,
): boolean {
  assertValidDate(
    now,
    'Throttle evaluation time',
  );

  if (!state) {
    return false;
  }

  assertFailureCount(
    state.failureCount,
  );

  assertValidDate(
    state.windowStartedAt,
    'Throttle window start',
  );

  if (!state.blockedUntil) {
    return false;
  }

  assertValidDate(
    state.blockedUntil,
    'Throttle blocked-until time',
  );

  return (
    now.getTime() <
    state.blockedUntil.getTime()
  );
}

export function transitionAuthThrottleFailure(
  scope: AuthThrottleScope,
  state: AuthThrottleState | null,
  now: Date,
): AuthThrottleFailureTransition {
  assertValidDate(
    now,
    'Throttle failure time',
  );

  const policy =
    getAdminAuthThrottlePolicy(
      scope,
    );

  if (
    isAuthThrottleBlocked(
      state,
      now,
    )
  ) {
    throw new Error(
      'Blocked auth throttle state must not consume another failure.',
    );
  }

  let windowStartedAt =
    now;

  let failureCount = 1;

  if (state) {
    assertFailureCount(
      state.failureCount,
    );

    assertValidDate(
      state.windowStartedAt,
      'Throttle window start',
    );

    const age =
      now.getTime() -
      state.windowStartedAt.getTime();

    if (
      age >= 0 &&
      age < policy.windowMs
    ) {
      windowStartedAt =
        state.windowStartedAt;

      failureCount =
        state.failureCount + 1;
    }
  }

  if (
    !Number.isSafeInteger(
      failureCount,
    )
  ) {
    throw new Error(
      'Auth throttle failure count overflowed the safe integer range.',
    );
  }

  const blockedUntil =
    failureCount >=
    policy.maxFailures
      ? new Date(
          now.getTime() +
          policy.blockMs,
        )
      : null;

  return {
    failureCount,
    windowStartedAt:
      new Date(
        windowStartedAt.getTime(),
      ),
    lastFailureAt:
      new Date(
        now.getTime(),
      ),
    blockedUntil,
  };
}

export function resetAuthThrottleState(
  now: Date,
): AuthThrottleResetState {
  assertValidDate(
    now,
    'Throttle reset time',
  );

  return {
    failureCount: 0,
    windowStartedAt:
      new Date(
        now.getTime(),
      ),
    lastFailureAt: null,
    blockedUntil: null,
  };
}

export function createLoginChallengeExpiresAt(
  now: Date,
): Date {
  assertValidDate(
    now,
    'Challenge creation time',
  );

  return new Date(
    now.getTime() +
    ADMIN_LOGIN_CHALLENGE_TTL_MS,
  );
}

export function isLoginChallengeActive(
  challenge: ChallengeState,
  now: Date,
): boolean {
  assertChallengeAttemptCount(
    challenge.attemptCount,
  );

  assertValidDate(
    challenge.expiresAt,
    'Challenge expiry time',
  );

  assertValidDate(
    now,
    'Challenge evaluation time',
  );

  if (challenge.consumedAt) {
    assertValidDate(
      challenge.consumedAt,
      'Challenge consumed time',
    );
  }

  if (challenge.invalidatedAt) {
    assertValidDate(
      challenge.invalidatedAt,
      'Challenge invalidated time',
    );
  }

  return (
    challenge.attemptCount <
      ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS &&
    challenge.consumedAt === null &&
    challenge.invalidatedAt === null &&
    now.getTime() <
      challenge.expiresAt.getTime()
  );
}

export function transitionLoginChallengeFailure(
  attemptCount: number,
  now: Date,
): ChallengeFailureTransition {
  assertChallengeAttemptCount(
    attemptCount,
  );

  assertValidDate(
    now,
    'Challenge failure time',
  );

  if (
    attemptCount >=
    ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS
  ) {
    throw new Error(
      'Exhausted login challenge must not consume another attempt.',
    );
  }

  const nextAttemptCount =
    attemptCount + 1;

  return {
    attemptCount:
      nextAttemptCount,
    invalidatedAt:
      nextAttemptCount >=
      ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS
        ? new Date(
            now.getTime(),
          )
        : null,
  };
}

export function createAdminSessionTiming(
  now: Date,
): AdminSessionTiming {
  assertValidDate(
    now,
    'Session creation time',
  );

  const absoluteExpiresAt =
    new Date(
      now.getTime() +
      ADMIN_SESSION_ABSOLUTE_TTL_MS,
    );

  const idleExpiresAt =
    new Date(
      Math.min(
        now.getTime() +
          ADMIN_SESSION_IDLE_TTL_MS,
        absoluteExpiresAt.getTime(),
      ),
    );

  return {
    createdAt:
      new Date(
        now.getTime(),
      ),
    lastSeenAt:
      new Date(
        now.getTime(),
      ),
    idleExpiresAt,
    absoluteExpiresAt,
  };
}

export function getAdminSessionExpiryReason(
  options: {
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    now: Date;
  },
):
  | 'idle_timeout'
  | 'absolute_timeout'
  | null {
  assertValidDate(
    options.idleExpiresAt,
    'Session idle expiry',
  );

  assertValidDate(
    options.absoluteExpiresAt,
    'Session absolute expiry',
  );

  assertValidDate(
    options.now,
    'Session evaluation time',
  );

  if (
    options.now.getTime() >=
    options.absoluteExpiresAt.getTime()
  ) {
    return 'absolute_timeout';
  }

  if (
    options.now.getTime() >=
    options.idleExpiresAt.getTime()
  ) {
    return 'idle_timeout';
  }

  return null;
}

export function shouldTouchAdminSession(
  lastSeenAt: Date,
  now: Date,
): boolean {
  assertValidDate(
    lastSeenAt,
    'Session last-seen time',
  );

  assertValidDate(
    now,
    'Session touch time',
  );

  const elapsed =
    now.getTime() -
    lastSeenAt.getTime();

  if (elapsed < 0) {
    throw new Error(
      'Session touch time must not precede last-seen time.',
    );
  }

  return (
    elapsed >=
    ADMIN_SESSION_TOUCH_INTERVAL_MS
  );
}

export function createTouchedIdleExpiry(
  now: Date,
  absoluteExpiresAt: Date,
): Date {
  assertValidDate(
    now,
    'Session touch time',
  );

  assertValidDate(
    absoluteExpiresAt,
    'Session absolute expiry',
  );

  if (
    now.getTime() >=
    absoluteExpiresAt.getTime()
  ) {
    throw new Error(
      'Expired absolute session lifetime cannot be touched.',
    );
  }

  return new Date(
    Math.min(
      now.getTime() +
        ADMIN_SESSION_IDLE_TTL_MS,
      absoluteExpiresAt.getTime(),
    ),
  );
}

export function isAdminSessionRevocationReason(
  value: string,
): value is AdminSessionRevocationReason {
  return (
    ADMIN_SESSION_REVOCATION_REASONS
  ).some(
    (candidate) =>
      candidate === value,
  );
}