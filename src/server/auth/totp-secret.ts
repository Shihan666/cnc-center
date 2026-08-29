import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

import {
  ADMIN_TOTP_KEY_VERSION,
  AES_GCM_NONCE_BYTES,
  AES_GCM_TAG_BYTES,
  AUTH_SECRET_KEY_BYTES,
  TOTP_SECRET_BYTES,
} from './constants.ts';

export type EncryptedTotpSecret = {
  secretCiphertext: Buffer;
  secretNonce: Buffer;
  secretAuthTag: Buffer;
  keyVersion: number;
};

function assertEncryptionKey(
  key: Uint8Array,
): void {
  if (
    key.byteLength !==
    AUTH_SECRET_KEY_BYTES
  ) {
    throw new Error(
      `TOTP encryption key must be ${AUTH_SECRET_KEY_BYTES} bytes.`,
    );
  }
}

function assertKeyVersion(
  keyVersion: number,
): void {
  if (
    !Number.isSafeInteger(
      keyVersion,
    ) ||
    keyVersion < 1
  ) {
    throw new Error(
      'TOTP key version must be a positive safe integer.',
    );
  }
}

function associatedData(
  keyVersion: number,
): Buffer {
  return Buffer.from(
    `cnc-center:admin-totp-secret:v1:key-version:${keyVersion}`,
    'utf8',
  );
}

export function encryptTotpSecret(
  secret: Uint8Array,
  key: Uint8Array,
  keyVersion:
    number =
      ADMIN_TOTP_KEY_VERSION,
): EncryptedTotpSecret {
  assertEncryptionKey(key);
  assertKeyVersion(keyVersion);

  if (
    secret.byteLength !==
    TOTP_SECRET_BYTES
  ) {
    throw new Error(
      `TOTP secret must be ${TOTP_SECRET_BYTES} bytes.`,
    );
  }

  const nonce =
    randomBytes(
      AES_GCM_NONCE_BYTES,
    );

  const cipher =
    createCipheriv(
      'aes-256-gcm',
      Buffer.from(key),
      nonce,
      {
        authTagLength:
          AES_GCM_TAG_BYTES,
      },
    );

  cipher.setAAD(
    associatedData(
      keyVersion,
    ),
  );

  const ciphertext =
    Buffer.concat([
      cipher.update(
        Buffer.from(secret),
      ),
      cipher.final(),
    ]);

  const authTag =
    cipher.getAuthTag();

  if (
    authTag.length !==
    AES_GCM_TAG_BYTES
  ) {
    throw new Error(
      'Unexpected AES-GCM authentication tag length.',
    );
  }

  return {
    secretCiphertext:
      ciphertext,
    secretNonce:
      nonce,
    secretAuthTag:
      authTag,
    keyVersion,
  };
}

export function decryptTotpSecret(
  encrypted: EncryptedTotpSecret,
  key: Uint8Array,
): Buffer {
  assertEncryptionKey(key);
  assertKeyVersion(
    encrypted.keyVersion,
  );

  if (
    encrypted.secretNonce.length !==
    AES_GCM_NONCE_BYTES
  ) {
    throw new Error(
      'Invalid encrypted TOTP nonce length.',
    );
  }

  if (
    encrypted.secretAuthTag.length !==
    AES_GCM_TAG_BYTES
  ) {
    throw new Error(
      'Invalid encrypted TOTP auth-tag length.',
    );
  }

  const decipher =
    createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key),
      encrypted.secretNonce,
      {
        authTagLength:
          AES_GCM_TAG_BYTES,
      },
    );

  decipher.setAAD(
    associatedData(
      encrypted.keyVersion,
    ),
  );

  decipher.setAuthTag(
    encrypted.secretAuthTag,
  );

  let plaintext: Buffer;

  try {
    plaintext =
      Buffer.concat([
        decipher.update(
          encrypted.secretCiphertext,
        ),
        decipher.final(),
      ]);
  }
  catch {
    throw new Error(
      'Unable to authenticate encrypted TOTP secret.',
    );
  }

  if (
    plaintext.length !==
    TOTP_SECRET_BYTES
  ) {
    throw new Error(
      'Decrypted TOTP secret has invalid length.',
    );
  }

  return plaintext;
}
