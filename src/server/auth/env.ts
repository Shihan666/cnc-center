import {
  AUTH_SECRET_KEY_BYTES,
} from './constants.ts';

type AuthEnvironment =
  Readonly<Record<string, string | undefined>>;

const BASE64URL_PATTERN =
  /^[A-Za-z0-9_-]+$/u;

function readKey(
  name: string,
  environment: AuthEnvironment,
): Buffer {
  const raw = environment[name];

  if (!raw) {
    throw new Error(
      `Missing required auth secret: ${name}`,
    );
  }

  if (
    raw.includes('=') ||
    !BASE64URL_PATTERN.test(raw)
  ) {
    throw new Error(
      `Auth secret ${name} must use canonical unpadded base64url.`,
    );
  }

  const decoded =
    Buffer.from(raw, 'base64url');

  if (
    decoded.length !==
    AUTH_SECRET_KEY_BYTES
  ) {
    throw new Error(
      `Auth secret ${name} must decode to ${AUTH_SECRET_KEY_BYTES} bytes.`,
    );
  }

  if (
    decoded.toString('base64url') !==
    raw
  ) {
    throw new Error(
      `Auth secret ${name} is not canonical base64url.`,
    );
  }

  return decoded;
}

export function getAdminTotpEncryptionKey(
  environment: AuthEnvironment =
    process.env,
): Buffer {
  return readKey(
    'ADMIN_TOTP_ENCRYPTION_KEY',
    environment,
  );
}

export function getAdminRecoveryCodeHmacKey(
  environment: AuthEnvironment =
    process.env,
): Buffer {
  return readKey(
    'ADMIN_RECOVERY_CODE_HMAC_KEY',
    environment,
  );
}

export function getAdminAuthThrottleHmacKey(
  environment: AuthEnvironment =
    process.env,
): Buffer {
  return readKey(
    'ADMIN_AUTH_THROTTLE_HMAC_KEY',
    environment,
  );
}
