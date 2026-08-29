import {
  createHmac,
} from 'node:crypto';

import {
  AUTH_SECRET_KEY_BYTES,
} from './constants.ts';

export type AuthThrottleScope =
  | 'password_account'
  | 'password_ip'
  | 'mfa_account'
  | 'mfa_ip';

const HMAC_PREFIX =
  'cnc-center:admin-auth:v1';

function assertHmacKey(
  key: Uint8Array,
): void {
  if (
    key.byteLength !==
    AUTH_SECRET_KEY_BYTES
  ) {
    throw new Error(
      `Auth HMAC key must be ${AUTH_SECRET_KEY_BYTES} bytes.`,
    );
  }
}

function hmacSha256Hex(
  key: Uint8Array,
  domain: string,
  value: string,
): string {
  assertHmacKey(key);

  return createHmac(
    'sha256',
    Buffer.from(key),
  )
    .update(
      HMAC_PREFIX,
      'utf8',
    )
    .update(
      Buffer.from([0]),
    )
    .update(
      domain,
      'utf8',
    )
    .update(
      Buffer.from([0]),
    )
    .update(
      value,
      'utf8',
    )
    .digest('hex');
}

export function hashRecoveryCodeForLookup(
  code: string,
  key: Uint8Array,
): string {
  return hmacSha256Hex(
    key,
    'recovery-code',
    code,
  );
}

export function hashAuthThrottleKey(
  scope: AuthThrottleScope,
  value: string,
  key: Uint8Array,
): string {
  return hmacSha256Hex(
    key,
    `throttle:${scope}`,
    value,
  );
}
