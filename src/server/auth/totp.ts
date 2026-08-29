import * as OTPAuth
  from 'otpauth';

import {
  TOTP_ALGORITHM,
  TOTP_DIGITS,
  TOTP_ISSUER,
  TOTP_PERIOD_SECONDS,
  TOTP_SECRET_BYTES,
  TOTP_WINDOW,
} from './constants.ts';

export type TotpVerificationResult =
  | {
      valid: true;
      counter: number;
      delta: number;
    }
  | {
      valid: false;
      reason:
        | 'invalid'
        | 'replayed';
    };

function assertTotpSecret(
  secret: Uint8Array,
): void {
  if (
    secret.byteLength !==
    TOTP_SECRET_BYTES
  ) {
    throw new Error(
      `TOTP secret must be ${TOTP_SECRET_BYTES} bytes.`,
    );
  }
}

function otpSecret(
  secret: Uint8Array,
): OTPAuth.Secret {
  assertTotpSecret(secret);

  return OTPAuth.Secret.fromHex(
    Buffer
      .from(secret)
      .toString('hex'),
  );
}

function totpForSecret(
  secret: Uint8Array,
  label: string,
): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer:
      TOTP_ISSUER,
    label,
    algorithm:
      TOTP_ALGORITHM,
    digits:
      TOTP_DIGITS,
    period:
      TOTP_PERIOD_SECONDS,
    secret:
      otpSecret(secret),
  });
}

export function generateTotpSecret(): Buffer {
  const secret =
    new OTPAuth.Secret({
      size:
        TOTP_SECRET_BYTES,
    });

  const bytes =
    Buffer.from(
      secret.bytes,
    );

  if (
    bytes.length !==
    TOTP_SECRET_BYTES
  ) {
    throw new Error(
      'Unexpected generated TOTP secret length.',
    );
  }

  return bytes;
}

export function totpSecretToBase32(
  secret: Uint8Array,
): string {
  return otpSecret(
    secret,
  ).base32;
}

export function buildTotpEnrollmentUri(
  secret: Uint8Array,
  label: string,
): string {
  if (
    label.trim().length === 0
  ) {
    throw new Error(
      'TOTP enrollment label must not be empty.',
    );
  }

  return totpForSecret(
    secret,
    label,
  ).toString();
}

export function verifyTotpToken(
  options: {
    secret: Uint8Array;
    token: string;
    timestamp?: number;
    lastUsedCounter?:
      number | null;
  },
): TotpVerificationResult {
  if (
    !/^\d{6}$/u.test(
      options.token,
    )
  ) {
    return {
      valid: false,
      reason: 'invalid',
    };
  }

  const timestamp =
    options.timestamp ??
    Date.now();

  if (
    !Number.isSafeInteger(
      timestamp,
    ) ||
    timestamp < 0
  ) {
    throw new Error(
      'TOTP timestamp must be a non-negative safe integer.',
    );
  }

  const totp =
    totpForSecret(
      options.secret,
      'admin',
    );

  const delta =
    totp.validate({
      token:
        options.token,
      window:
        TOTP_WINDOW,
      timestamp,
    });

  if (delta === null) {
    return {
      valid: false,
      reason: 'invalid',
    };
  }

  const currentCounter =
    Math.floor(
      timestamp /
      (
        TOTP_PERIOD_SECONDS *
        1000
      ),
    );

  const matchedCounter =
    currentCounter +
    delta;

  const lastUsedCounter =
    options.lastUsedCounter ??
    null;

  if (
    lastUsedCounter !== null &&
    (
      !Number.isSafeInteger(
        lastUsedCounter,
      ) ||
      lastUsedCounter < 0
    )
  ) {
    throw new Error(
      'TOTP last-used counter must be null or a non-negative safe integer.',
    );
  }

  if (
    lastUsedCounter !== null &&
    matchedCounter <=
      lastUsedCounter
  ) {
    return {
      valid: false,
      reason: 'replayed',
    };
  }

  return {
    valid: true,
    counter:
      matchedCounter,
    delta,
  };
}
