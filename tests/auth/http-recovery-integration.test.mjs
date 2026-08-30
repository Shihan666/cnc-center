import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  test,
} from 'node:test';

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
    'TEST_DATABASE_URL is required for recovery HTTP integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for recovery HTTP integration tests.',
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
    generateRecoveryCodes,
    isRecoveryCodeFormat,
  },
  {
    generateOpaqueAuthToken,
    hashOpaqueAuthToken,
  },
] =
  await Promise.all([
    import(
      '../../src/pages/api/admin/auth/recovery.ts'
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
      '../../src/server/auth/recovery-codes.ts'
    ),
    import(
      '../../src/server/auth/tokens.ts'
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
  lastLoginAt = null,
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
        ${lastLoginAt},
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
  type = 'mfa',
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
        ${type},
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
function createRecoveryCode() {
  const codes =
    generateRecoveryCodes();

  assert.equal(
    codes.length,
    10,
  );

  const code =
    codes[0];

  assert.equal(
    isRecoveryCodeFormat(
      code,
    ),
    true,
  );

  return code;
}

async function insertRecoveryCode({
  adminId,
  recoveryCode,
  now,
  usedAt = null,
  revokedAt = null,
}) {
  const codeHash =
    hashRecoveryCodeForLookup(
      recoveryCode,
      TEST_RECOVERY_HMAC_KEY,
    );

  const [row] =
    await migrationSql`
      insert into admin_recovery_codes (
        admin_id,
        code_hash,
        created_at,
        used_at,
        revoked_at
      )
      values (
        ${adminId},
        ${codeHash},
        ${now},
        ${usedAt},
        ${revokedAt}
      )
      returning
        id,
        code_hash,
        used_at,
        revoked_at
    `;

  assert.ok(
    row,
  );

  return {
    id:
      row.id,

    codeHash:
      row.code_hash,
  };
}

async function recoveryState(
  recoveryId,
) {
  const [row] =
    await migrationSql`
      select
        code_hash,
        created_at,
        used_at,
        revoked_at
      from admin_recovery_codes
      where id = ${recoveryId}
    `;

  return row ?? null;
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

async function throttleState(
  scope,
  keyHash,
) {
  const [row] =
    await migrationSql`
      select
        failure_count,
        window_started_at,
        last_failure_at,
        blocked_until
      from admin_auth_throttles
      where
        scope = ${scope}
        and
        key_hash = ${keyHash}
    `;

  return row ?? null;
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

function createRecoveryContext({
  recoveryCode,
  recorder,
  clientAddress,
}) {
  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/recovery',
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
              recoveryCode,
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
        'HTTP-Recovery-MFA-Test-1!',
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
  'successful recovery MFA consumes exactly one recovery code returns only admin identity sets a recovery-authenticated session and clears the challenge credential',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.181';

    const admin =
      await insertAdmin({
        email:
          'http-recovery-success@example.test',

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

    const recoveryCode =
      createRecoveryCode();

    const recovery =
      await insertRecoveryCode({
        adminId:
          admin.id,

        recoveryCode,

        now:
          fixtureNow,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const throttleWindow =
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
        throttleWindow,
    });

    await insertThrottle({
      scope:
        'mfa_ip',

      keyHash:
        keys.ip,

      failureCount:
        1,

      now:
        throttleWindow,
    });

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createRecoveryContext({
          recoveryCode,

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
      Object.hasOwn(
        body,
        'recoveryCode',
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        body,
        'recoveryCodes',
      ),
      false,
    );

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

    const persistedRecovery =
      await recoveryState(
        recovery.id,
      );

    assert.equal(
      persistedRecovery.code_hash,
      recovery.codeHash,
    );

    assert.ok(
      persistedRecovery.used_at,
    );

    assert.equal(
      persistedRecovery.revoked_at,
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
      'recovery',
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

    const accountThrottle =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipThrottle =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountThrottle.failure_count,
      0,
    );

    assert.equal(
      accountThrottle.blocked_until,
      null,
    );

    assert.equal(
      ipThrottle.failure_count,
      0,
    );

    assert.equal(
      ipThrottle.blocked_until,
      null,
    );
  },
);
test(
  'malformed recovery code returns 401 invalid_second_factor retains the challenge credential increments the challenge attempt and consumes no recovery code',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.182';

    const admin =
      await insertAdmin({
        email:
          'http-recovery-invalid@example.test',

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

    const validRecoveryCode =
      createRecoveryCode();

    const recovery =
      await insertRecoveryCode({
        adminId:
          admin.id,

        recoveryCode:
          validRecoveryCode,

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
        createRecoveryContext({
          recoveryCode:
            'not-a-valid-recovery-code',

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

    const persistedRecovery =
      await recoveryState(
        recovery.id,
      );

    assert.equal(
      persistedRecovery.used_at,
      null,
    );

    assert.equal(
      persistedRecovery.revoked_at,
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
  },
);

test(
  'enrollment challenge presented to recovery MFA returns 401 invalid_challenge clears the challenge credential and leaves the recovery code active',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.183';

    const admin =
      await insertAdmin({
        email:
          'http-recovery-wrong-challenge@example.test',

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

        type:
          'enrollment',
      });

    const recoveryCode =
      createRecoveryCode();

    const recovery =
      await insertRecoveryCode({
        adminId:
          admin.id,

        recoveryCode,

        now:
          fixtureNow,
      });

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createRecoveryContext({
          recoveryCode,

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

    assert.equal(
      persistedChallenge.invalidated_at,
      null,
    );

    const persistedRecovery =
      await recoveryState(
        recovery.id,
      );

    assert.equal(
      persistedRecovery.used_at,
      null,
    );

    assert.equal(
      persistedRecovery.revoked_at,
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
  },
);

test(
  'blocked MFA account returns 429 retains the active challenge credential and does not consume a valid recovery code',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.184';

    const admin =
      await insertAdmin({
        email:
          'http-recovery-throttled@example.test',

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

    const recoveryCode =
      createRecoveryCode();

    const recovery =
      await insertRecoveryCode({
        adminId:
          admin.id,

        recoveryCode,

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
        createRecoveryContext({
          recoveryCode,

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

    const persistedRecovery =
      await recoveryState(
        recovery.id,
      );

    assert.equal(
      persistedRecovery.used_at,
      null,
    );

    assert.equal(
      persistedRecovery.revoked_at,
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
  },
);

test(
  'a consumed recovery code replayed through a fresh active MFA challenge returns 401 invalid_second_factor retains the challenge credential and creates no session',
  async () => {
    const fixtureNow =
      new Date();

    const clientIp =
      '203.0.113.185';

    const admin =
      await insertAdmin({
        email:
          'http-recovery-replay@example.test',

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

    const recoveryCode =
      createRecoveryCode();

    const recovery =
      await insertRecoveryCode({
        adminId:
          admin.id,

        recoveryCode,

        now:
          fixtureNow,

        usedAt:
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
        createRecoveryContext({
          recoveryCode,

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

    const persistedRecovery =
      await recoveryState(
        recovery.id,
      );

    assert.ok(
      persistedRecovery.used_at,
    );

    assert.equal(
      persistedRecovery.used_at.getTime(),
      fixtureNow.getTime(),
    );

    assert.equal(
      persistedRecovery.revoked_at,
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
  },
);