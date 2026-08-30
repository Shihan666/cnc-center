import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  test,
} from 'node:test';

import * as OTPAuth from 'otpauth';
import postgres from 'postgres';

process.loadEnvFile(
  '.env.local',
);

const testDatabaseUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

const testMigrationUrl =
  process.env
    .TEST_DATABASE_MIGRATION_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for enrollment-confirm HTTP integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for enrollment-confirm HTTP integration tests.',
  );
}

const originalDatabaseUrl =
  process.env.DATABASE_URL;

const originalTotpEncryptionKey =
  process.env.ADMIN_TOTP_ENCRYPTION_KEY;

const originalRecoveryHmacKey =
  process.env.ADMIN_RECOVERY_CODE_HMAC_KEY;

const originalThrottleHmacKey =
  process.env.ADMIN_AUTH_THROTTLE_HMAC_KEY;

process.env.DATABASE_URL =
  testDatabaseUrl;

const TEST_TOTP_ENCRYPTION_KEY =
  Buffer.alloc(
    32,
    11,
  );

const TEST_RECOVERY_HMAC_KEY =
  Buffer.alloc(
    32,
    13,
  );

const TEST_THROTTLE_HMAC_KEY =
  Buffer.alloc(
    32,
    17,
  );

process.env.ADMIN_TOTP_ENCRYPTION_KEY =
  TEST_TOTP_ENCRYPTION_KEY.toString(
    'base64url',
  );

process.env.ADMIN_RECOVERY_CODE_HMAC_KEY =
  TEST_RECOVERY_HMAC_KEY.toString(
    'base64url',
  );

process.env.ADMIN_AUTH_THROTTLE_HMAC_KEY =
  TEST_THROTTLE_HMAC_KEY.toString(
    'base64url',
  );

const [
  {
    POST,
  },
  {
    closeDatabase,
  },
  {
    hashPassword,
  },
  {
    hashAuthThrottleKey,
    hashRecoveryCodeForLookup,
  },
  {
    generateOpaqueAuthToken,
    hashOpaqueAuthToken,
  },
  {
    encryptTotpSecret,
  },
  {
    generateTotpSecret,
    totpSecretToBase32,
  },
] =
  await Promise.all([
    import(
      '../../src/pages/api/admin/auth/enrollment/confirm.ts'
    ),
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/auth/password.ts'
    ),
    import(
      '../../src/server/auth/hmac.ts'
    ),
    import(
      '../../src/server/auth/tokens.ts'
    ),
    import(
      '../../src/server/auth/totp-secret.ts'
    ),
    import(
      '../../src/server/auth/totp.ts'
    ),
  ]);

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max: 4,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const ownedAdminIds =
  new Set();

const ownedThrottlePairs =
  new Map();

let reusablePasswordHash;
function rememberThrottle(
  scope,
  keyHash,
) {
  ownedThrottlePairs.set(
    `${scope}:${keyHash}`,
    {
      scope,
      keyHash,
    },
  );
}

function mfaKeys(
  adminId,
  clientIp,
) {
  const account =
    hashAuthThrottleKey(
      'mfa_account',
      adminId,
      TEST_THROTTLE_HMAC_KEY,
    );

  const ip =
    hashAuthThrottleKey(
      'mfa_ip',
      clientIp,
      TEST_THROTTLE_HMAC_KEY,
    );

  rememberThrottle(
    'mfa_account',
    account,
  );

  rememberThrottle(
    'mfa_ip',
    ip,
  );

  return {
    account,
    ip,
  };
}

async function assertTestDatabase() {
  const [row] =
    await migrationSql`
      select
        current_database()
          as database_name
    `;

  assert.equal(
    row.database_name,
    EXPECTED_TEST_DATABASE,
  );
}

async function insertAdmin({
  email,
  now,
}) {
  const [row] =
    await migrationSql`
      insert into admins (
        email,
        password_hash,
        is_active,
        password_changed_at,
        last_login_at,
        created_at,
        updated_at
      )
      values (
        ${email},
        ${reusablePasswordHash},
        true,
        ${now},
        null,
        ${now},
        ${now}
      )
      returning
        id,
        email
    `;

  assert.ok(
    row,
  );

  ownedAdminIds.add(
    row.id,
  );

  return row;
}

async function insertChallenge({
  adminId,
  challengeToken,
  now,
  invalidatedAt = null,
}) {
  const expiresAt =
    new Date(
      now.getTime() +
        5 * 60 * 1_000,
    );

  const [row] =
    await migrationSql`
      insert into admin_login_challenges (
        admin_id,
        token_hash,
        type,
        attempt_count,
        expires_at,
        consumed_at,
        invalidated_at,
        created_at
      )
      values (
        ${adminId},
        ${
          hashOpaqueAuthToken(
            challengeToken,
          )
        },
        'enrollment',
        0,
        ${expiresAt},
        null,
        ${invalidatedAt},
        ${now}
      )
      returning
        id,
        attempt_count,
        consumed_at,
        invalidated_at
    `;

  assert.ok(
    row,
  );

  return row;
}
async function insertTotpFactor({
  adminId,
  now,
  secret =
    generateTotpSecret(),
}) {
  const encrypted =
    encryptTotpSecret(
      secret,
      TEST_TOTP_ENCRYPTION_KEY,
    );

  const [row] =
    await migrationSql`
      insert into admin_totp_factors (
        admin_id,
        secret_ciphertext,
        secret_nonce,
        secret_auth_tag,
        key_version,
        last_used_counter,
        confirmed_at,
        created_at,
        updated_at
      )
      values (
        ${adminId},
        ${encrypted.secretCiphertext},
        ${encrypted.secretNonce},
        ${encrypted.secretAuthTag},
        ${encrypted.keyVersion},
        null,
        null,
        ${now},
        ${now}
      )
      returning
        id
    `;

  assert.ok(
    row,
  );

  return {
    id:
      row.id,
    secret,
  };
}

function createTotpToken(
  secret,
  now,
) {
  const totp =
    new OTPAuth.TOTP({
      issuer:
        'CNC Center',

      label:
        'http-confirm@example.test',

      algorithm:
        'SHA1',

      digits:
        6,

      period:
        30,

      secret:
        OTPAuth.Secret.fromBase32(
          totpSecretToBase32(
            secret,
          ),
        ),
    });

  return totp.generate({
    timestamp:
      now.getTime(),
  });
}

async function challengeState(
  challengeId,
) {
  const [row] =
    await migrationSql`
      select
        attempt_count,
        consumed_at,
        invalidated_at
      from admin_login_challenges
      where id = ${challengeId}
    `;

  return row ?? null;
}

async function factorState(
  adminId,
) {
  const [row] =
    await migrationSql`
      select
        last_used_counter,
        confirmed_at,
        updated_at
      from admin_totp_factors
      where admin_id = ${adminId}
    `;

  return row ?? null;
}

async function adminState(
  adminId,
) {
  const [row] =
    await migrationSql`
      select
        is_active,
        last_login_at
      from admins
      where id = ${adminId}
    `;

  return row ?? null;
}

async function recoveryRows(
  adminId,
) {
  return migrationSql`
    select
      code_hash,
      created_at,
      used_at,
      revoked_at
    from admin_recovery_codes
    where admin_id = ${adminId}
    order by code_hash
  `;
}

async function sessionRows(
  adminId,
) {
  return migrationSql`
    select
      token_hash,
      auth_method,
      created_at,
      last_seen_at,
      idle_expires_at,
      absolute_expires_at,
      revoked_at,
      revocation_reason
    from admin_sessions
    where admin_id = ${adminId}
    order by created_at, id
  `;
}
async function insertThrottle({
  scope,
  keyHash,
  failureCount,
  now,
  blockedUntil = null,
}) {
  rememberThrottle(
    scope,
    keyHash,
  );

  const lastFailureAt =
    failureCount > 0
      ? now
      : null;

  await migrationSql`
    insert into admin_auth_throttles (
      scope,
      key_hash,
      failure_count,
      window_started_at,
      last_failure_at,
      blocked_until,
      created_at,
      updated_at
    )
    values (
      ${scope},
      ${keyHash},
      ${failureCount},
      ${now},
      ${lastFailureAt},
      ${blockedUntil},
      ${now},
      ${now}
    )
  `;
}

function createCookieRecorder(
  challengeToken,
) {
  const setCalls = [];
  const deleteCalls = [];

  return {
    setCalls,
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        assert.equal(
          name,
          'cnc_admin_challenge',
        );

        return {
          value:
            challengeToken,
        };
      },

      set(
        name,
        value,
        options,
      ) {
        setCalls.push({
          name,
          value,
          options,
        });
      },

      delete(
        name,
        options,
      ) {
        deleteCalls.push({
          name,
          options,
        });
      },
    },
  };
}

function createConfirmContext({
  totpToken,
  recorder,
  clientAddress,
}) {
  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/enrollment/confirm',
        {
          method: 'POST',

          headers: {
            origin:
              'http://localhost:4321',

            'content-type':
              'application/json',
          },

          body:
            JSON.stringify({
              totpToken,
            }),
        },
      ),

    cookies:
      recorder.cookies,

    site:
      new URL(
        'http://localhost:4321',
      ),

    clientAddress,
  };
}
async function cleanupOwnedRows() {
  for (
    const {
      scope,
      keyHash,
    } of
    ownedThrottlePairs.values()
  ) {
    await migrationSql`
      delete from admin_auth_throttles
      where
        scope = ${scope}
        and
        key_hash = ${keyHash}
    `;
  }

  ownedThrottlePairs.clear();

  for (
    const adminId of
    ownedAdminIds
  ) {
    await migrationSql`
      delete from admin_sessions
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admin_recovery_codes
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admin_totp_factors
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admin_login_challenges
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admins
      where id = ${adminId}
    `;
  }

  ownedAdminIds.clear();
}

before(
  async () => {
    await assertTestDatabase();

    reusablePasswordHash =
      await hashPassword(
        'HTTP-Confirm-Enrollment-Test-1!',
      );
  },
);

afterEach(
  async () => {
    await cleanupOwnedRows();
  },
);

after(
  async () => {
    try {
      await cleanupOwnedRows();

      await closeDatabase();

      await migrationSql.end({
        timeout: 5,
      });
    } finally {
      if (
        originalDatabaseUrl ===
        undefined
      ) {
        delete process.env
          .DATABASE_URL;
      } else {
        process.env.DATABASE_URL =
          originalDatabaseUrl;
      }

      if (
        originalTotpEncryptionKey ===
        undefined
      ) {
        delete process.env
          .ADMIN_TOTP_ENCRYPTION_KEY;
      } else {
        process.env.ADMIN_TOTP_ENCRYPTION_KEY =
          originalTotpEncryptionKey;
      }

      if (
        originalRecoveryHmacKey ===
        undefined
      ) {
        delete process.env
          .ADMIN_RECOVERY_CODE_HMAC_KEY;
      } else {
        process.env.ADMIN_RECOVERY_CODE_HMAC_KEY =
          originalRecoveryHmacKey;
      }

      if (
        originalThrottleHmacKey ===
        undefined
      ) {
        delete process.env
          .ADMIN_AUTH_THROTTLE_HMAC_KEY;
      } else {
        process.env.ADMIN_AUTH_THROTTLE_HMAC_KEY =
          originalThrottleHmacKey;
      }
    }
  },
);
async function assertJsonFailure(
  response,
  status,
  reason,
) {
  assert.equal(
    response.status,
    status,
  );

  assert.equal(
    response.headers.get(
      'cache-control',
    ),
    'no-store',
  );

  assert.equal(
    response.headers.get(
      'content-type',
    ),
    'application/json; charset=utf-8',
  );

  assert.deepEqual(
    await response.json(),
    {
      ok: false,
      reason,
    },
  );
}

function assertChallengeCookieDeleted(
  recorder,
) {
  assert.deepEqual(
    recorder.deleteCalls,
    [
      {
        name:
          'cnc_admin_challenge',

        options: {
          httpOnly: true,
          sameSite: 'strict',
          secure: false,
          path:
            '/api/admin/auth',
        },
      },
    ],
  );
}
test(
  'successful enrollment confirm returns recovery codes once sets only the session credential clears the challenge credential and persists matching privileged state',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.161';

    const admin =
      await insertAdmin({
        email:
          'http-confirm-success@example.test',

        now:
          fixtureNow,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,

        challengeToken,

        now:
          fixtureNow,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,

        now:
          fixtureNow,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const previousWindow =
      new Date(
        fixtureNow.getTime() -
          60_000,
      );

    await insertThrottle({
      scope:
        'mfa_account',

      keyHash:
        keys.account,

      failureCount:
        1,

      now:
        previousWindow,
    });

    await insertThrottle({
      scope:
        'mfa_ip',

      keyHash:
        keys.ip,

      failureCount:
        1,

      now:
        previousWindow,
    });

    const totpToken =
      createTotpToken(
        secret,
        new Date(),
      );

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createConfirmContext({
          totpToken,

          recorder,

          clientAddress:
            clientIp,
        }),
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    const body =
      await response.json();

    assert.deepEqual(
      Object.keys(
        body,
      ).sort(),
      [
        'admin',
        'ok',
        'recoveryCodes',
      ],
    );

    assert.equal(
      body.ok,
      true,
    );

    assert.deepEqual(
      body.admin,
      {
        id:
          admin.id,

        email:
          admin.email,
      },
    );

    assert.equal(
      Object.hasOwn(
        body,
        'sessionToken',
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        body,
        'challengeToken',
      ),
      false,
    );

    assert.equal(
      body.recoveryCodes.length,
      10,
    );

    assert.equal(
      new Set(
        body.recoveryCodes,
      ).size,
      10,
    );

    for (
      const code of
      body.recoveryCodes
    ) {
      assert.equal(
        typeof code,
        'string',
      );

      assert.ok(
        code.length > 0,
      );
    }

    assert.equal(
      recorder.setCalls.length,
      1,
    );

    const sessionCookie =
      recorder.setCalls[0];

    assert.equal(
      sessionCookie.name,
      'cnc_admin_session',
    );

    assert.equal(
      typeof sessionCookie.value,
      'string',
    );

    assert.ok(
      sessionCookie.value.length > 0,
    );

    assert.deepEqual(
      sessionCookie.options,
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/',
        maxAge:
          8 * 60 * 60,
      },
    );

    assertChallengeCookieDeleted(
      recorder,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge.attempt_count,
      0,
    );

    assert.ok(
      persistedChallenge.consumed_at,
    );

    assert.equal(
      persistedChallenge.invalidated_at,
      null,
    );

    const persistedFactor =
      await factorState(
        admin.id,
      );

    assert.ok(
      persistedFactor.confirmed_at,
    );

    assert.notEqual(
      persistedFactor.last_used_counter,
      null,
    );

    const persistedAdmin =
      await adminState(
        admin.id,
      );

    assert.equal(
      persistedAdmin.is_active,
      true,
    );

    assert.ok(
      persistedAdmin.last_login_at,
    );

    const recovery =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recovery.length,
      10,
    );

    const expectedRecoveryHashes =
      body.recoveryCodes
        .map(
          (code) =>
            hashRecoveryCodeForLookup(
              code,
              TEST_RECOVERY_HMAC_KEY,
            ),
        )
        .sort();

    assert.deepEqual(
      recovery.map(
        (row) =>
          row.code_hash,
      ),
      expectedRecoveryHashes,
    );

    for (
      const row of
      recovery
    ) {
      assert.equal(
        row.used_at,
        null,
      );

      assert.equal(
        row.revoked_at,
        null,
      );
    }

    const sessions =
      await sessionRows(
        admin.id,
      );

    assert.equal(
      sessions.length,
      1,
    );

    assert.equal(
      sessions[0].auth_method,
      'totp',
    );

    assert.equal(
      sessions[0].token_hash,
      hashOpaqueAuthToken(
        sessionCookie.value,
      ),
    );

    assert.equal(
      sessions[0].revoked_at,
      null,
    );

    assert.equal(
      sessions[0].revocation_reason,
      null,
    );
  },
);
test(
  'invalid second factor returns 401 while retaining the challenge cookie and never creating a session or recovery codes',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.162';

    const admin =
      await insertAdmin({
        email:
          'http-confirm-invalid-second@example.test',

        now:
          fixtureNow,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,

        challengeToken,

        now:
          fixtureNow,
      });

    await insertTotpFactor({
      adminId:
        admin.id,

      now:
        fixtureNow,
    });

    mfaKeys(
      admin.id,
      clientIp,
    );

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createConfirmContext({
          totpToken:
            'not-six-digits',

          recorder,

          clientAddress:
            clientIp,
        }),
      );

    await assertJsonFailure(
      response,
      401,
      'invalid_second_factor',
    );

    assert.equal(
      recorder.setCalls.length,
      0,
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge.attempt_count,
      1,
    );

    assert.equal(
      persistedChallenge.consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge.invalidated_at,
      null,
    );

    const persistedFactor =
      await factorState(
        admin.id,
      );

    assert.equal(
      persistedFactor.confirmed_at,
      null,
    );

    assert.equal(
      (
        await sessionRows(
          admin.id,
        )
      ).length,
      0,
    );

    assert.equal(
      (
        await recoveryRows(
          admin.id,
        )
      ).length,
      0,
    );
  },
);

test(
  'persisted invalid enrollment challenge returns 401 clears the challenge cookie and never sets a session cookie',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.163';

    const admin =
      await insertAdmin({
        email:
          'http-confirm-invalid-challenge@example.test',

        now:
          fixtureNow,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const invalidatedAt =
      new Date(
        fixtureNow.getTime(),
      );

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,

        challengeToken,

        now:
          fixtureNow,

        invalidatedAt,
      });

    await insertTotpFactor({
      adminId:
        admin.id,

      now:
        fixtureNow,
    });

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createConfirmContext({
          totpToken:
            '123456',

          recorder,

          clientAddress:
            clientIp,
        }),
      );

    await assertJsonFailure(
      response,
      401,
      'invalid_challenge',
    );

    assert.equal(
      recorder.setCalls.length,
      0,
    );

    assertChallengeCookieDeleted(
      recorder,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge.attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge.consumed_at,
      null,
    );

    assert.ok(
      persistedChallenge.invalidated_at,
    );

    assert.equal(
      (
        await sessionRows(
          admin.id,
        )
      ).length,
      0,
    );

    assert.equal(
      (
        await recoveryRows(
          admin.id,
        )
      ).length,
      0,
    );
  },
);

test(
  'blocked MFA account returns 429 while retaining the challenge cookie and without consuming the active enrollment challenge',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.164';

    const admin =
      await insertAdmin({
        email:
          'http-confirm-throttled@example.test',

        now:
          fixtureNow,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,

        challengeToken,

        now:
          fixtureNow,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,

        now:
          fixtureNow,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    await insertThrottle({
      scope:
        'mfa_account',

      keyHash:
        keys.account,

      failureCount:
        5,

      now:
        fixtureNow,

      blockedUntil:
        new Date(
          fixtureNow.getTime() +
            15 * 60 * 1_000,
        ),
    });

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createConfirmContext({
          totpToken:
            createTotpToken(
              secret,
              new Date(),
            ),

          recorder,

          clientAddress:
            clientIp,
        }),
      );

    await assertJsonFailure(
      response,
      429,
      'throttled',
    );

    assert.equal(
      recorder.setCalls.length,
      0,
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge.attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge.consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge.invalidated_at,
      null,
    );

    const persistedFactor =
      await factorState(
        admin.id,
      );

    assert.equal(
      persistedFactor.confirmed_at,
      null,
    );

    assert.equal(
      (
        await sessionRows(
          admin.id,
        )
      ).length,
      0,
    );

    assert.equal(
      (
        await recoveryRows(
          admin.id,
        )
      ).length,
      0,
    );
  },
);