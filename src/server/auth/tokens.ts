import {
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  OPAQUE_AUTH_TOKEN_BYTES,
  SHA256_HEX_LENGTH,
} from './constants.ts';

const SHA256_HEX_PATTERN =
  /^[0-9a-f]{64}$/u;

export function generateOpaqueAuthToken(): string {
  return randomBytes(
    OPAQUE_AUTH_TOKEN_BYTES,
  ).toString('base64url');
}

export function hashOpaqueAuthToken(
  token: string,
): string {
  return createHash('sha256')
    .update(token, 'utf8')
    .digest('hex');
}

export function isSha256Hex(
  value: string,
): boolean {
  return (
    value.length ===
      SHA256_HEX_LENGTH &&
    SHA256_HEX_PATTERN.test(value)
  );
}
