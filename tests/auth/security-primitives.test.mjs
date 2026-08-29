import assert
  from "node:assert/strict";

import {
  randomBytes,
} from "node:crypto";

import {
  test,
} from "node:test";

import * as OTPAuth
  from "otpauth";

import {
  getAdminAuthThrottleHmacKey,
  getAdminRecoveryCodeHmacKey,
  getAdminTotpEncryptionKey,
} from "../../src/server/auth/env.ts";

import {
  hashAuthThrottleKey,
  hashRecoveryCodeForLookup,
} from "../../src/server/auth/hmac.ts";

import {
  hashPassword,
  passwordHashNeedsRehash,
  runDummyPasswordVerification,
  verifyPassword,
} from "../../src/server/auth/password.ts";

import {
  generateRecoveryCodes,
  isRecoveryCodeFormat,
} from "../../src/server/auth/recovery-codes.ts";

import {
  generateOpaqueAuthToken,
  hashOpaqueAuthToken,
  isSha256Hex,
} from "../../src/server/auth/tokens.ts";

import {
  decryptTotpSecret,
  encryptTotpSecret,
} from "../../src/server/auth/totp-secret.ts";

import {
  buildTotpEnrollmentUri,
  generateTotpSecret,
  totpSecretToBase32,
  verifyTotpToken,
} from "../../src/server/auth/totp.ts";

const PASSWORD =
  "CNC Center F2B password probe";

test(
  "password hashes use the locked Argon2id PHC contract",
  async () => {
    const encoded =
      await hashPassword(
        PASSWORD,
      );

    assert.match(
      encoded,
      /^\$argon2id\$v=19\$m=32768,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/u,
    );

    assert.equal(
      passwordHashNeedsRehash(
        encoded,
      ),
      false,
    );

    assert.equal(
      await verifyPassword(
        PASSWORD,
        encoded,
      ),
      true,
    );

    assert.equal(
      await verifyPassword(
        `${PASSWORD}-wrong`,
        encoded,
      ),
      false,
    );
  },
);

test(
  "password hashes use independent random salts",
  async () => {
    const first =
      await hashPassword(
        PASSWORD,
      );

    const second =
      await hashPassword(
        PASSWORD,
      );

    assert.notEqual(
      first,
      second,
    );

    assert.equal(
      await verifyPassword(
        PASSWORD,
        first,
      ),
      true,
    );

    assert.equal(
      await verifyPassword(
        PASSWORD,
        second,
      ),
      true,
    );
  },
);

test(
  "malformed or non-current PHC strings are rejected",
  async () => {
    const malformed = [
      "",
      "$argon2id$broken",
      "$argon2i$v=19$m=32768,t=3,p=1$AAAA$BBBB",
      "$argon2id$v=16$m=32768,t=3,p=1$AAAA$BBBB",
      "$argon2id$v=19$m=65536,t=3,p=1$AAAA$BBBB",
      "$argon2id$v=19$m=32768,t=4,p=1$AAAA$BBBB",
      "$argon2id$v=19$m=32768,t=3,p=2$AAAA$BBBB",
    ];

    for (
      const value of malformed
    ) {
      assert.equal(
        passwordHashNeedsRehash(
          value,
        ),
        true,
      );

      assert.equal(
        await verifyPassword(
          PASSWORD,
          value,
        ),
        false,
      );
    }
  },
);

test(
  "dummy password verification executes without accepting data",
  async () => {
    await assert.doesNotReject(
      runDummyPasswordVerification(
        "nonexistent-account-probe",
      ),
    );
  },
);

test(
  "opaque auth tokens are 256-bit base64url values and hash deterministically",
  () => {
    const first =
      generateOpaqueAuthToken();

    const second =
      generateOpaqueAuthToken();

    assert.match(
      first,
      /^[A-Za-z0-9_-]{43}$/u,
    );

    assert.match(
      second,
      /^[A-Za-z0-9_-]{43}$/u,
    );

    assert.notEqual(
      first,
      second,
    );

    const firstHash =
      hashOpaqueAuthToken(
        first,
      );

    assert.equal(
      firstHash,
      hashOpaqueAuthToken(
        first,
      ),
    );

    assert.equal(
      isSha256Hex(
        firstHash,
      ),
      true,
    );

    assert.equal(
      isSha256Hex(
        firstHash.toUpperCase(),
      ),
      false,
    );

    assert.equal(
      isSha256Hex(
        "0".repeat(63),
      ),
      false,
    );
  },
);

test(
  "auth secret env parser accepts only canonical unpadded 32-byte base64url",
  () => {
    const encryptionKey =
      randomBytes(32);

    const recoveryKey =
      randomBytes(32);

    const throttleKey =
      randomBytes(32);

    const environment = {
      ADMIN_TOTP_ENCRYPTION_KEY:
        encryptionKey
          .toString(
            "base64url",
          ),

      ADMIN_RECOVERY_CODE_HMAC_KEY:
        recoveryKey
          .toString(
            "base64url",
          ),

      ADMIN_AUTH_THROTTLE_HMAC_KEY:
        throttleKey
          .toString(
            "base64url",
          ),
    };

    assert.deepEqual(
      getAdminTotpEncryptionKey(
        environment,
      ),
      encryptionKey,
    );

    assert.deepEqual(
      getAdminRecoveryCodeHmacKey(
        environment,
      ),
      recoveryKey,
    );

    assert.deepEqual(
      getAdminAuthThrottleHmacKey(
        environment,
      ),
      throttleKey,
    );

    assert.throws(
      () =>
        getAdminTotpEncryptionKey(
          {},
        ),
      /Missing required auth secret/u,
    );

    assert.throws(
      () =>
        getAdminTotpEncryptionKey({
          ADMIN_TOTP_ENCRYPTION_KEY:
            randomBytes(31)
              .toString(
                "base64url",
              ),
        }),
      /must decode to 32 bytes/u,
    );

    assert.throws(
      () =>
        getAdminTotpEncryptionKey({
          ADMIN_TOTP_ENCRYPTION_KEY:
            randomBytes(33)
              .toString(
                "base64url",
              ),
        }),
      /must decode to 32 bytes/u,
    );

    assert.throws(
      () =>
        getAdminTotpEncryptionKey({
          ADMIN_TOTP_ENCRYPTION_KEY:
            `${encryptionKey.toString("base64url")}=`,
        }),
      /canonical unpadded base64url/u,
    );

    assert.throws(
      () =>
        getAdminTotpEncryptionKey({
          ADMIN_TOTP_ENCRYPTION_KEY:
            ` ${encryptionKey.toString("base64url")}`,
        }),
      /canonical unpadded base64url/u,
    );
  },
);

test(
  "HMAC lookup values are deterministic and domain separated",
  () => {
    const key =
      randomBytes(32);

    const otherKey =
      randomBytes(32);

    const value =
      "same-input";

    const recovery =
      hashRecoveryCodeForLookup(
        value,
        key,
      );

    const passwordAccount =
      hashAuthThrottleKey(
        "password_account",
        value,
        key,
      );

    const passwordIp =
      hashAuthThrottleKey(
        "password_ip",
        value,
        key,
      );

    const mfaAccount =
      hashAuthThrottleKey(
        "mfa_account",
        value,
        key,
      );

    const mfaIp =
      hashAuthThrottleKey(
        "mfa_ip",
        value,
        key,
      );

    const values = [
      recovery,
      passwordAccount,
      passwordIp,
      mfaAccount,
      mfaIp,
    ];

    for (
      const hash of values
    ) {
      assert.equal(
        isSha256Hex(hash),
        true,
      );
    }

    assert.equal(
      new Set(values).size,
      values.length,
    );

    assert.equal(
      recovery,
      hashRecoveryCodeForLookup(
        value,
        key,
      ),
    );

    assert.notEqual(
      recovery,
      hashRecoveryCodeForLookup(
        value,
        otherKey,
      ),
    );

    assert.throws(
      () =>
        hashRecoveryCodeForLookup(
          value,
          randomBytes(31),
        ),
      /must be 32 bytes/u,
    );
  },
);

test(
  "recovery-code generator returns exactly ten unique 128-bit codes",
  () => {
    const codes =
      generateRecoveryCodes();

    assert.equal(
      codes.length,
      10,
    );

    assert.equal(
      new Set(codes).size,
      10,
    );

    for (
      const code of codes
    ) {
      assert.equal(
        code.length,
        22,
      );

      assert.equal(
        isRecoveryCodeFormat(
          code,
        ),
        true,
      );
    }

    assert.equal(
      isRecoveryCodeFormat(
        "short",
      ),
      false,
    );

    assert.equal(
      isRecoveryCodeFormat(
        "!".repeat(22),
      ),
      false,
    );
  },
);

test(
  "AES-256-GCM TOTP encryption round-trips with locked storage dimensions",
  () => {
    const secret =
      generateTotpSecret();

    const key =
      randomBytes(32);

    const encrypted =
      encryptTotpSecret(
        secret,
        key,
      );

    assert.equal(
      encrypted.secretCiphertext.length,
      20,
    );

    assert.equal(
      encrypted.secretNonce.length,
      12,
    );

    assert.equal(
      encrypted.secretAuthTag.length,
      16,
    );

    assert.equal(
      encrypted.keyVersion,
      1,
    );

    assert.deepEqual(
      decryptTotpSecret(
        encrypted,
        key,
      ),
      secret,
    );
  },
);

test(
  "AES-256-GCM rejects wrong keys and tampering",
  () => {
    const secret =
      generateTotpSecret();

    const key =
      randomBytes(32);

    const encrypted =
      encryptTotpSecret(
        secret,
        key,
      );

    assert.throws(
      () =>
        decryptTotpSecret(
          encrypted,
          randomBytes(32),
        ),
      /Unable to authenticate/u,
    );

    const tamperedCiphertext =
      Buffer.from(
        encrypted.secretCiphertext,
      );

    tamperedCiphertext[0] ^= 1;

    assert.throws(
      () =>
        decryptTotpSecret(
          {
            ...encrypted,
            secretCiphertext:
              tamperedCiphertext,
          },
          key,
        ),
      /Unable to authenticate/u,
    );

    const tamperedTag =
      Buffer.from(
        encrypted.secretAuthTag,
      );

    tamperedTag[0] ^= 1;

    assert.throws(
      () =>
        decryptTotpSecret(
          {
            ...encrypted,
            secretAuthTag:
              tamperedTag,
          },
          key,
        ),
      /Unable to authenticate/u,
    );

    const tamperedNonce =
      Buffer.from(
        encrypted.secretNonce,
      );

    tamperedNonce[0] ^= 1;

    assert.throws(
      () =>
        decryptTotpSecret(
          {
            ...encrypted,
            secretNonce:
              tamperedNonce,
          },
          key,
        ),
      /Unable to authenticate/u,
    );

    assert.throws(
      () =>
        decryptTotpSecret(
          {
            ...encrypted,
            keyVersion: 2,
          },
          key,
        ),
      /Unable to authenticate/u,
    );
  },
);

test(
  "AES/TOTP primitives reject invalid key and secret dimensions",
  () => {
    assert.throws(
      () =>
        encryptTotpSecret(
          randomBytes(19),
          randomBytes(32),
        ),
      /TOTP secret must be 20 bytes/u,
    );

    assert.throws(
      () =>
        encryptTotpSecret(
          randomBytes(20),
          randomBytes(31),
        ),
      /encryption key must be 32 bytes/u,
    );

    const secret =
      generateTotpSecret();

    const key =
      randomBytes(32);

    const encrypted =
      encryptTotpSecret(
        secret,
        key,
      );

    assert.throws(
      () =>
        decryptTotpSecret(
          {
            ...encrypted,
            secretNonce:
              randomBytes(11),
          },
          key,
        ),
      /nonce length/u,
    );

    assert.throws(
      () =>
        decryptTotpSecret(
          {
            ...encrypted,
            secretAuthTag:
              randomBytes(15),
          },
          key,
        ),
      /auth-tag length/u,
    );
  },
);

test(
  "TOTP secret and enrollment URI use the locked profile",
  () => {
    const secret =
      generateTotpSecret();

    assert.equal(
      secret.length,
      20,
    );

    const base32 =
      totpSecretToBase32(
        secret,
      );

    assert.match(
      base32,
      /^[A-Z2-7]{32}$/u,
    );

    const uri =
      buildTotpEnrollmentUri(
        secret,
        "admin@example.invalid",
      );

    assert.match(
      uri,
      /^otpauth:\/\/totp\//u,
    );

    assert.match(
      uri,
      /issuer=CNC%20Center/u,
    );

    assert.match(
      uri,
      /algorithm=SHA1/u,
    );

    assert.match(
      uri,
      /digits=6/u,
    );

    assert.match(
      uri,
      /period=30/u,
    );

    assert.throws(
      () =>
        buildTotpEnrollmentUri(
          secret,
          "   ",
        ),
      /must not be empty/u,
    );
  },
);

test(
  "TOTP accepts current, previous, and next counters within window one",
  () => {
    const secret =
      generateTotpSecret();

    const timestamp =
      1_800_000_000_000;

    const totp =
      new OTPAuth.TOTP({
        issuer:
          "CNC Center",

        label:
          "admin@example.invalid",

        algorithm:
          "SHA1",

        digits:
          6,

        period:
          30,

        secret:
          OTPAuth.Secret.fromHex(
            secret.toString(
              "hex",
            ),
          ),
      });

    const currentCounter =
      Math.floor(
        timestamp / 30_000,
      );

    for (
      const offset of [
        -1,
        0,
        1,
      ]
    ) {
      const token =
        totp.generate({
          timestamp:
            timestamp +
            offset * 30_000,
        });

      const result =
        verifyTotpToken({
          secret,
          token,
          timestamp,
        });

      assert.equal(
        result.valid,
        true,
      );

      if (!result.valid) {
        throw new Error(
          "Unreachable invalid TOTP result.",
        );
      }

      assert.equal(
        result.counter,
        currentCounter +
          offset,
      );

      assert.equal(
        result.delta,
        offset,
      );
    }
  },
);

test(
  "TOTP rejects tokens outside window one",
  () => {
    const secret =
      generateTotpSecret();

    const timestamp =
      1_800_000_000_000;

    const totp =
      new OTPAuth.TOTP({
        issuer:
          "CNC Center",

        label:
          "admin@example.invalid",

        algorithm:
          "SHA1",

        digits:
          6,

        period:
          30,

        secret:
          OTPAuth.Secret.fromHex(
            secret.toString(
              "hex",
            ),
          ),
      });

    for (
      const offset of [
        -2,
        2,
      ]
    ) {
      const token =
        totp.generate({
          timestamp:
            timestamp +
            offset * 30_000,
        });

      assert.deepEqual(
        verifyTotpToken({
          secret,
          token,
          timestamp,
        }),
        {
          valid: false,
          reason: "invalid",
        },
      );
    }
  },
);

test(
  "TOTP replay defense rejects equal or older matched counters",
  () => {
    const secret =
      generateTotpSecret();

    const timestamp =
      1_800_000_000_000;

    const totp =
      new OTPAuth.TOTP({
        issuer:
          "CNC Center",

        label:
          "admin@example.invalid",

        algorithm:
          "SHA1",

        digits:
          6,

        period:
          30,

        secret:
          OTPAuth.Secret.fromHex(
            secret.toString(
              "hex",
            ),
          ),
      });

    const token =
      totp.generate({
        timestamp,
      });

    const first =
      verifyTotpToken({
        secret,
        token,
        timestamp,
      });

    assert.equal(
      first.valid,
      true,
    );

    if (!first.valid) {
      throw new Error(
        "Unreachable invalid first-use result.",
      );
    }

    assert.deepEqual(
      verifyTotpToken({
        secret,
        token,
        timestamp,
        lastUsedCounter:
          first.counter,
      }),
      {
        valid: false,
        reason: "replayed",
      },
    );

    assert.deepEqual(
      verifyTotpToken({
        secret,
        token,
        timestamp,
        lastUsedCounter:
          first.counter + 1,
      }),
      {
        valid: false,
        reason: "replayed",
      },
    );
  },
);

test(
  "TOTP rejects malformed tokens and invalid timestamps",
  () => {
    const secret =
      generateTotpSecret();

    for (
      const token of [
        "",
        "12345",
        "1234567",
        "abcdef",
        "１２３４５６",
      ]
    ) {
      assert.deepEqual(
        verifyTotpToken({
          secret,
          token,
        }),
        {
          valid: false,
          reason: "invalid",
        },
      );
    }

    assert.throws(
      () =>
        verifyTotpToken({
          secret,
          token: "123456",
          timestamp: -1,
        }),
      /non-negative safe integer/u,
    );

    assert.throws(
      () =>
        verifyTotpToken({
          secret,
          token: "123456",
          timestamp:
            Number.MAX_SAFE_INTEGER +
            1,
        }),
      /non-negative safe integer/u,
    );
  },
);
test(
  "TOTP replay state rejects malformed persisted counters",
  () => {
    const secret =
      generateTotpSecret();

    const timestamp =
      1_800_000_000_000;

    const totp =
      new OTPAuth.TOTP({
        issuer:
          "CNC Center",

        label:
          "admin@example.invalid",

        algorithm:
          "SHA1",

        digits:
          6,

        period:
          30,

        secret:
          OTPAuth.Secret.fromHex(
            secret.toString(
              "hex",
            ),
          ),
      });

    const token =
      totp.generate({
        timestamp,
      });

    const validZero =
      verifyTotpToken({
        secret,
        token,
        timestamp,
        lastUsedCounter: 0,
      });

    assert.equal(
      validZero.valid,
      true,
    );

    for (
      const invalidCounter of [
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      assert.throws(
        () =>
          verifyTotpToken({
            secret,
            token,
            timestamp,
            lastUsedCounter:
              invalidCounter,
          }),
        /null or a non-negative safe integer/u,
      );
    }
  },
);
