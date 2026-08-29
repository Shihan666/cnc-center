import {
  argon2,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  ARGON2_MEMORY_KIB,
  ARGON2_PARALLELISM,
  ARGON2_PASSES,
  ARGON2_SALT_BYTES,
  ARGON2_TAG_BYTES,
  ARGON2_VERSION,
} from './constants.ts';

type ParsedPasswordHash = {
  salt: Buffer;
  tag: Buffer;
};

const PASSWORD_HASH_PATTERN =
  /^\$argon2id\$v=19\$m=32768,t=3,p=1\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/u;

const DUMMY_SALT =
  Buffer.from(
    'cnc-center-dummy',
    'utf8',
  );

const DUMMY_TAG =
  Buffer.alloc(
    ARGON2_TAG_BYTES,
    0,
  );

function encodePhcBase64(
  value: Uint8Array,
): string {
  return Buffer
    .from(value)
    .toString('base64')
    .replace(/=+$/u, '');
}

function decodePhcBase64(
  value: string,
): Buffer | null {
  if (
    value.length === 0 ||
    value.includes('=')
  ) {
    return null;
  }

  const decoded =
    Buffer.from(value, 'base64');

  if (
    encodePhcBase64(decoded) !==
    value
  ) {
    return null;
  }

  return decoded;
}

function deriveArgon2id(
  password: string,
  salt: Uint8Array,
): Promise<Buffer> {
  return new Promise(
    (resolve, reject) => {
      argon2(
        'argon2id',
        {
          message:
            Buffer.from(
              password,
              'utf8',
            ),
          nonce:
            Buffer.from(salt),
          parallelism:
            ARGON2_PARALLELISM,
          tagLength:
            ARGON2_TAG_BYTES,
          memory:
            ARGON2_MEMORY_KIB,
          passes:
            ARGON2_PASSES,
        },
        (
          error,
          derivedKey,
        ) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(
            Buffer.from(
              derivedKey,
            ),
          );
        },
      );
    },
  );
}

function parsePasswordHash(
  encodedHash: string,
): ParsedPasswordHash | null {
  const match =
    PASSWORD_HASH_PATTERN.exec(
      encodedHash,
    );

  if (!match) {
    return null;
  }

  const salt =
    decodePhcBase64(
      match[1],
    );

  const tag =
    decodePhcBase64(
      match[2],
    );

  if (
    !salt ||
    !tag ||
    salt.length !==
      ARGON2_SALT_BYTES ||
    tag.length !==
      ARGON2_TAG_BYTES
  ) {
    return null;
  }

  return {
    salt,
    tag,
  };
}

export async function hashPassword(
  password: string,
): Promise<string> {
  const salt =
    randomBytes(
      ARGON2_SALT_BYTES,
    );

  const tag =
    await deriveArgon2id(
      password,
      salt,
    );

  return [
    'argon2id',
    `v=${ARGON2_VERSION}`,
    `m=${ARGON2_MEMORY_KIB},t=${ARGON2_PASSES},p=${ARGON2_PARALLELISM}`,
    encodePhcBase64(salt),
    encodePhcBase64(tag),
  ].join('$').replace(
    /^/u,
    '$',
  );
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const parsed =
    parsePasswordHash(
      encodedHash,
    );

  if (!parsed) {
    return false;
  }

  const candidate =
    await deriveArgon2id(
      password,
      parsed.salt,
    );

  return timingSafeEqual(
    candidate,
    parsed.tag,
  );
}

export async function runDummyPasswordVerification(
  password: string,
): Promise<void> {
  const candidate =
    await deriveArgon2id(
      password,
      DUMMY_SALT,
    );

  timingSafeEqual(
    candidate,
    DUMMY_TAG,
  );
}

export function passwordHashNeedsRehash(
  encodedHash: string,
): boolean {
  return (
    parsePasswordHash(
      encodedHash,
    ) === null
  );
}
