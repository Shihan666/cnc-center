import type {
  AuthThrottleScope,
} from './hmac.ts';

export const ADMIN_EMAIL_MAX_LENGTH = 320;

export const ADMIN_PASSWORD_MAX_UTF8_BYTES =
  1_024;

export const ADMIN_LOGIN_CHALLENGE_TTL_MS =
  5 * 60 * 1_000;

export const ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS =
  5;

export const ADMIN_SESSION_IDLE_TTL_MS =
  30 * 60 * 1_000;

export const ADMIN_SESSION_ABSOLUTE_TTL_MS =
  8 * 60 * 60 * 1_000;

export const ADMIN_SESSION_TOUCH_INTERVAL_MS =
  5 * 60 * 1_000;

export type AdminAuthThrottlePolicy =
  Readonly<{
    windowMs: number;
    maxFailures: number;
    blockMs: number;
  }>;

export const ADMIN_AUTH_THROTTLE_POLICIES = {
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
} as const satisfies
  Record<
    AuthThrottleScope,
    AdminAuthThrottlePolicy
  >;

export type AdminLoginNext =
  | 'enrollment'
  | 'mfa';

export type AdminSessionAuthMethod =
  | 'totp'
  | 'recovery';

export const ADMIN_SESSION_REVOCATION_REASONS =
  [
    'logout',
    'idle_timeout',
    'absolute_timeout',
    'password_changed',
    'mfa_reset',
    'admin_disabled',
  ] as const;

export type AdminSessionRevocationReason =
  (
    typeof ADMIN_SESSION_REVOCATION_REASONS
  )[number];

export type AdminPublicIdentity =
  Readonly<{
    id: string;
    email: string;
  }>;

export type BeginAdminLoginResult =
  | Readonly<{
      ok: true;
      challengeToken: string;
      next: AdminLoginNext;
    }>
  | Readonly<{
      ok: false;
      reason:
        | 'invalid_credentials'
        | 'throttled';
    }>;

export type PrepareAdminTotpEnrollmentResult =
  | Readonly<{
      ok: true;
      secretBase32: string;
      enrollmentUri: string;
    }>
  | Readonly<{
      ok: false;
      reason: 'invalid_challenge';
    }>;

export type AdminSecondFactorFailureReason =
  | 'invalid_challenge'
  | 'invalid_second_factor'
  | 'throttled';

export type AdminSessionSuccess =
  Readonly<{
    ok: true;
    sessionToken: string;
    admin: AdminPublicIdentity;
  }>;

export type CompleteAdminSecondFactorResult =
  | AdminSessionSuccess
  | Readonly<{
      ok: false;
      reason:
        AdminSecondFactorFailureReason;
    }>;

export type ConfirmAdminTotpEnrollmentResult =
  | Readonly<{
      ok: true;
      sessionToken: string;
      admin: AdminPublicIdentity;
      recoveryCodes:
        readonly string[];
    }>
  | Readonly<{
      ok: false;
      reason:
        AdminSecondFactorFailureReason;
    }>;

export type ResolvedAdminSession =
  Readonly<{
    sessionId: string;
    admin: AdminPublicIdentity;
    authMethod:
      AdminSessionAuthMethod;
    createdAt: Date;
    lastSeenAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }>;