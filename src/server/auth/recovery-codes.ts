import {
  randomBytes,
} from 'node:crypto';

import {
  RECOVERY_CODE_BYTES,
  RECOVERY_CODE_COUNT,
} from './constants.ts';

const RECOVERY_CODE_PATTERN =
  /^[A-Za-z0-9_-]{22}$/u;

function generateRecoveryCode(): string {
  return randomBytes(
    RECOVERY_CODE_BYTES,
  ).toString('base64url');
}

export function generateRecoveryCodes(): string[] {
  const codes =
    new Set<string>();

  while (
    codes.size <
    RECOVERY_CODE_COUNT
  ) {
    codes.add(
      generateRecoveryCode(),
    );
  }

  return [...codes];
}

export function isRecoveryCodeFormat(
  value: string,
): boolean {
  return RECOVERY_CODE_PATTERN.test(
    value,
  );
}
