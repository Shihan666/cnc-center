import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_AUTH_THROTTLE_POLICIES,
  ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS,
  ADMIN_LOGIN_CHALLENGE_TTL_MS,
  ADMIN_PASSWORD_MAX_UTF8_BYTES,
  ADMIN_SESSION_ABSOLUTE_TTL_MS,
  ADMIN_SESSION_IDLE_TTL_MS,
  ADMIN_SESSION_TOUCH_INTERVAL_MS,
} from '../../src/server/auth/service-contract.ts';

import {
  canonicalizeAdminEmail,
  createAdminSessionTiming,
  createLoginChallengeExpiresAt,
  createTouchedIdleExpiry,
  getAdminAuthThrottlePolicy,
  getAdminSessionExpiryReason,
  isAdminEmailInputValid,
  isAdminPasswordInputValid,
  isAdminSessionRevocationReason,
  isAuthThrottleBlocked,
  isLoginChallengeActive,
  requireCanonicalClientIp,
  resetAuthThrottleState,
  shouldTouchAdminSession,
  transitionAuthThrottleFailure,
  transitionLoginChallengeFailure,
} from '../../src/server/auth/service-foundation.ts';

const baseTime =
  new Date(
    '2026-08-29T12:00:00.000Z',
  );

test(
  'admin email canonicalization matches the locked trim/lowercase contract',
  () => {
    assert.equal(
      canonicalizeAdminEmail(
        '  ADMIN@Example.COM  ',
      ),
      'admin@example.com',
    );

    assert.equal(
      isAdminEmailInputValid(
        ' Admin@Example.com ',
      ),
      true,
    );

    assert.equal(
      isAdminEmailInputValid(
        '   ',
      ),
      false,
    );

    assert.equal(
      isAdminEmailInputValid(
        'a'.repeat(321),
      ),
      false,
    );
  },
);

test(
  'password input limit is enforced in UTF-8 bytes',
  () => {
    assert.equal(
      ADMIN_PASSWORD_MAX_UTF8_BYTES,
      1_024,
    );

    assert.equal(
      isAdminPasswordInputValid(
        'a'.repeat(1_024),
      ),
      true,
    );

    assert.equal(
      isAdminPasswordInputValid(
        'a'.repeat(1_025),
      ),
      false,
    );

    assert.equal(
      isAdminPasswordInputValid(''),
      false,
    );

    assert.equal(
      isAdminPasswordInputValid(
        'é'.repeat(512),
      ),
      true,
    );

    assert.equal(
      isAdminPasswordInputValid(
        'é'.repeat(513),
      ),
      false,
    );
  },
);

test(
  'client IP must already be canonical when it enters the service layer',
  () => {
    assert.equal(
      requireCanonicalClientIp(
        '203.0.113.10',
      ),
      '203.0.113.10',
    );

    assert.throws(
      () =>
        requireCanonicalClientIp(
          ' 203.0.113.10',
        ),
      /canonical/u,
    );

    assert.throws(
      () =>
        requireCanonicalClientIp(''),
      /canonical/u,
    );
  },
);

test(
  'login challenge TTL is exactly five minutes',
  () => {
    const expiry =
      createLoginChallengeExpiresAt(
        baseTime,
      );

    assert.equal(
      expiry.getTime() -
        baseTime.getTime(),
      ADMIN_LOGIN_CHALLENGE_TTL_MS,
    );

    assert.equal(
      ADMIN_LOGIN_CHALLENGE_TTL_MS,
      5 * 60 * 1_000,
    );
  },
);

test(
  'login challenge activity and five-attempt invalidation are fail closed',
  () => {
    const expiresAt =
      createLoginChallengeExpiresAt(
        baseTime,
      );

    assert.equal(
      isLoginChallengeActive(
        {
          attemptCount: 0,
          expiresAt,
          consumedAt: null,
          invalidatedAt: null,
        },
        baseTime,
      ),
      true,
    );

    assert.equal(
      isLoginChallengeActive(
        {
          attemptCount:
            ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS,
          expiresAt,
          consumedAt: null,
          invalidatedAt: null,
        },
        baseTime,
      ),
      false,
    );

    const fourth =
      transitionLoginChallengeFailure(
        3,
        baseTime,
      );

    assert.deepEqual(
      fourth,
      {
        attemptCount: 4,
        invalidatedAt: null,
      },
    );

    const fifth =
      transitionLoginChallengeFailure(
        4,
        baseTime,
      );

    assert.equal(
      fifth.attemptCount,
      5,
    );

    assert.equal(
      fifth.invalidatedAt?.getTime(),
      baseTime.getTime(),
    );

    assert.throws(
      () =>
        transitionLoginChallengeFailure(
          5,
          baseTime,
        ),
      /must not consume/u,
    );
  },
);

test(
  'session timing is exactly thirty-minute idle and eight-hour absolute',
  () => {
    const timing =
      createAdminSessionTiming(
        baseTime,
      );

    assert.equal(
      timing.idleExpiresAt.getTime() -
        timing.createdAt.getTime(),
      ADMIN_SESSION_IDLE_TTL_MS,
    );

    assert.equal(
      timing.absoluteExpiresAt.getTime() -
        timing.createdAt.getTime(),
      ADMIN_SESSION_ABSOLUTE_TTL_MS,
    );

    assert.equal(
      ADMIN_SESSION_IDLE_TTL_MS,
      30 * 60 * 1_000,
    );

    assert.equal(
      ADMIN_SESSION_ABSOLUTE_TTL_MS,
      8 * 60 * 60 * 1_000,
    );
  },
);

test(
  'session touch occurs at most every five minutes and idle expiry is absolute-capped',
  () => {
    assert.equal(
      shouldTouchAdminSession(
        baseTime,
        new Date(
          baseTime.getTime() +
            ADMIN_SESSION_TOUCH_INTERVAL_MS -
            1,
        ),
      ),
      false,
    );

    assert.equal(
      shouldTouchAdminSession(
        baseTime,
        new Date(
          baseTime.getTime() +
            ADMIN_SESSION_TOUCH_INTERVAL_MS,
        ),
      ),
      true,
    );

    const absoluteExpiresAt =
      new Date(
        baseTime.getTime() +
          10 * 60 * 1_000,
      );

    const touched =
      createTouchedIdleExpiry(
        baseTime,
        absoluteExpiresAt,
      );

    assert.equal(
      touched.getTime(),
      absoluteExpiresAt.getTime(),
    );

    assert.throws(
      () =>
        shouldTouchAdminSession(
          baseTime,
          new Date(
            baseTime.getTime() - 1,
          ),
        ),
      /must not precede/u,
    );
  },
);

test(
  'session expiry reason prioritizes absolute expiry and otherwise detects idle expiry',
  () => {
    assert.equal(
      getAdminSessionExpiryReason({
        idleExpiresAt:
          new Date(
            baseTime.getTime() +
              1_000,
          ),
        absoluteExpiresAt:
          new Date(
            baseTime.getTime() +
              2_000,
          ),
        now:
          new Date(
            baseTime.getTime() +
              1_500,
          ),
      }),
      'idle_timeout',
    );

    assert.equal(
      getAdminSessionExpiryReason({
        idleExpiresAt:
          new Date(
            baseTime.getTime() +
              1_000,
          ),
        absoluteExpiresAt:
          new Date(
            baseTime.getTime() +
              2_000,
          ),
        now:
          new Date(
            baseTime.getTime() +
              2_000,
          ),
      }),
      'absolute_timeout',
    );

    assert.equal(
      getAdminSessionExpiryReason({
        idleExpiresAt:
          new Date(
            baseTime.getTime() +
              1_000,
          ),
        absoluteExpiresAt:
          new Date(
            baseTime.getTime() +
              2_000,
          ),
        now: baseTime,
      }),
      null,
    );
  },
);

test(
  'all four persistent throttle policies match the locked contract',
  () => {
    assert.deepEqual(
      ADMIN_AUTH_THROTTLE_POLICIES,
      {
        password_account: {
          windowMs:
            15 * 60 * 1_000,
          maxFailures: 5,
          blockMs:
            15 * 60 * 1_000,
        },
        password_ip: {
          windowMs:
            15 * 60 * 1_000,
          maxFailures: 20,
          blockMs:
            15 * 60 * 1_000,
        },
        mfa_account: {
          windowMs:
            10 * 60 * 1_000,
          maxFailures: 5,
          blockMs:
            15 * 60 * 1_000,
        },
        mfa_ip: {
          windowMs:
            10 * 60 * 1_000,
          maxFailures: 20,
          blockMs:
            15 * 60 * 1_000,
        },
      },
    );

    assert.equal(
      getAdminAuthThrottlePolicy(
        'password_account',
      ).maxFailures,
      5,
    );
  },
);

test(
  'throttle failure transition blocks exactly at the configured threshold',
  () => {
    let state = null;

    for (
      let failure = 1;
      failure <= 5;
      failure++
    ) {
      const transition =
        transitionAuthThrottleFailure(
          'password_account',
          state,
          new Date(
            baseTime.getTime() +
              failure * 1_000,
          ),
        );

      assert.equal(
        transition.failureCount,
        failure,
      );

      if (failure < 5) {
        assert.equal(
          transition.blockedUntil,
          null,
        );
      }
      else {
        assert.equal(
          transition.blockedUntil?.getTime(),
          baseTime.getTime() +
            5_000 +
            15 * 60 * 1_000,
        );
      }

      state = {
        failureCount:
          transition.failureCount,
        windowStartedAt:
          transition.windowStartedAt,
        blockedUntil:
          transition.blockedUntil,
      };
    }

    assert.equal(
      isAuthThrottleBlocked(
        state,
        new Date(
          baseTime.getTime() +
            6_000,
        ),
      ),
      true,
    );

    assert.throws(
      () =>
        transitionAuthThrottleFailure(
          'password_account',
          state,
          new Date(
            baseTime.getTime() +
              6_000,
          ),
        ),
      /must not consume/u,
    );
  },
);

test(
  'expired throttle windows restart at one and success reset is explicit',
  () => {
    const transition =
      transitionAuthThrottleFailure(
        'mfa_account',
        {
          failureCount: 4,
          windowStartedAt:
            baseTime,
          blockedUntil: null,
        },
        new Date(
          baseTime.getTime() +
            10 * 60 * 1_000,
        ),
      );

    assert.equal(
      transition.failureCount,
      1,
    );

    assert.equal(
      transition.windowStartedAt.getTime(),
      baseTime.getTime() +
        10 * 60 * 1_000,
    );

    const reset =
      resetAuthThrottleState(
        baseTime,
      );

    assert.deepEqual(
      reset,
      {
        failureCount: 0,
        windowStartedAt:
          baseTime,
        lastFailureAt: null,
        blockedUntil: null,
      },
    );
  },
);

test(
  'session revocation reasons are restricted to the locked vocabulary',
  () => {
    for (
      const reason of [
        'logout',
        'idle_timeout',
        'absolute_timeout',
        'password_changed',
        'mfa_reset',
        'admin_disabled',
      ]
    ) {
      assert.equal(
        isAdminSessionRevocationReason(
          reason,
        ),
        true,
      );
    }

    assert.equal(
      isAdminSessionRevocationReason(
        'other',
      ),
      false,
    );
  },
);