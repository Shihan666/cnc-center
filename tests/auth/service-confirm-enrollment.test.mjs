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

for (
  const name of [
    'TEST_DATABASE_MIGRATION_URL',
    'TEST_DATABASE_URL',
  ]
) {
  if (
    typeof process.env[name] !==
      'string' ||
    process.env[name].length === 0
  ) {
    throw new Error(
      `${name} is required for the confirm-enrollment DB-backed suite.`,
    );
  }
}

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL;

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
  TEST_TOTP_ENCRYPTION_KEY
    .toString(
      'base64url',
    );

process.env.ADMIN_RECOVERY_CODE_HMAC_KEY =
  TEST_RECOVERY_HMAC_KEY
    .toString(
      'base64url',
    );

process.env.ADMIN_AUTH_THROTTLE_HMAC_KEY =
  TEST_THROTTLE_HMAC_KEY
    .toString(
      'base64url',
    );

const [
  {
    confirmAdminTotpEnrollment,
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
    isRecoveryCodeFormat,
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
    verifyTotpToken,
  },
] =
  await Promise.all([
    import(
      '../../src/server/auth/service.ts'
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
    import(
      '../../src/server/auth/totp-secret.ts'
    ),
    import(
      '../../src/server/auth/totp.ts'
    ),
  ]);

const migrationSql =
  postgres(
    process.env
      .TEST_DATABASE_MIGRATION_URL,
    {
      max: 4,
      prepare: false,
    },
  );

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
        current_database() as name
    `;

  assert.equal(
    row.name,
    'cnc_center_test',
  );
}

async function authTableCounts() {
  return migrationSql`
    select
      'admins' as table_name,
      count(*)::int as row_count
    from admins

    union all

    select
      'admin_login_challenges',
      count(*)::int
    from admin_login_challenges

    union all

    select
      'admin_totp_factors',
      count(*)::int
    from admin_totp_factors

    union all

    select
      'admin_recovery_codes',
      count(*)::int
    from admin_recovery_codes

    union all

    select
      'admin_sessions',
      count(*)::int
    from admin_sessions

    union all

    select
      'admin_auth_throttles',
      count(*)::int
    from admin_auth_throttles

    order by table_name
  `;
}

async function assertAuthTablesEmpty() {
  const rows =
    await authTableCounts();

  for (const row of rows) {
    assert.equal(
      row.row_count,
      0,
      `${row.table_name} must be empty`,
    );
  }
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

async function insertAdmin({
  email,
  now,
  isActive = true,
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
        ${isActive},
        ${now},
        ${lastLoginAt},
        ${now},
        ${now}
      )
      returning
        id,
        email
    `;

  ownedAdminIds.add(
    row.id,
  );

  return row;
}

async function insertChallenge({
  adminId,
  challengeToken,
  now,
  type = 'enrollment',
  expiresAt =
    new Date(
      now.getTime() +
        5 * 60 * 1000,
    ),
  attemptCount = 0,
  consumedAt = null,
  invalidatedAt = null,
  createdAt = now,
}) {
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
        ${attemptCount},
        ${expiresAt},
        ${consumedAt},
        ${invalidatedAt},
        ${createdAt}
      )
      returning
        id,
        attempt_count,
        consumed_at,
        invalidated_at
    `;

  return row;
}

async function insertTotpFactor({
  adminId,
  now,
  secret =
    generateTotpSecret(),
  confirmedAt = null,
  lastUsedCounter = null,
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
        ${lastUsedCounter},
        ${confirmedAt},
        ${now},
        ${now}
      )
      returning
        id
    `;

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
        'confirm-test@example.com',
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

  return row;
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

  return row;
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

  return row;
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

async function countAdminRows(
  table,
  adminId,
) {
  const allowed =
    new Set([
      'admin_sessions',
      'admin_recovery_codes',
    ]);

  if (!allowed.has(table)) {
    throw new Error(
      'Unexpected countAdminRows table.',
    );
  }

  const [row] =
    await migrationSql.unsafe(
      `select count(*)::int as count from ${table} where admin_id = $1`,
      [
        adminId,
      ],
    );

  return row.count;
}

before(
  async () => {
    await assertTestDatabase();
    await assertAuthTablesEmpty();

    reusablePasswordHash =
      await hashPassword(
        'Confirm-Enrollment-Test-Password-1!',
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
    await cleanupOwnedRows();

    await closeDatabase();

    await assertAuthTablesEmpty();

    await migrationSql.end({
      timeout: 5,
    });
  },
);

test(
  'successful enrollment confirmation atomically confirms TOTP provisions ten hash-only recovery codes creates a TOTP session consumes the challenge resets MFA throttles and updates last login',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:00:00.000Z',
      );

    const clientIp =
      '203.0.113.61';

    const admin =
      await insertAdmin({
        email:
          'confirm-success@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const throttleWindow =
      new Date(
        now.getTime() -
          60 * 1000,
      );

    await insertThrottle({
      scope:
        'mfa_account',
      keyHash:
        keys.account,
      failureCount:
        2,
      now:
        throttleWindow,
    });

    await insertThrottle({
      scope:
        'mfa_ip',
      keyHash:
        keys.ip,
      failureCount:
        7,
      now:
        throttleWindow,
    });

    const token =
      createTotpToken(
        secret,
        now,
      );

    const expectedVerification =
      verifyTotpToken({
        secret,
        token,
        timestamp:
          now.getTime(),
        lastUsedCounter:
          null,
      });

    assert.equal(
      expectedVerification.valid,
      true,
    );

    const result =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          token,
        clientIp,
        now,
      });

    assert.equal(
      result.ok,
      true,
    );

    assert.deepEqual(
      result.admin,
      {
        id:
          admin.id,
        email:
          admin.email,
      },
    );

    assert.equal(
      result.recoveryCodes.length,
      10,
    );

    assert.equal(
      new Set(
        result.recoveryCodes,
      ).size,
      10,
    );

    for (
      const code of
      result.recoveryCodes
    ) {
      assert.equal(
        isRecoveryCodeFormat(
          code,
        ),
        true,
      );
    }

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      factor.confirmed_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      Number(
        factor.last_used_counter,
      ),
      expectedVerification.counter,
    );

    assert.equal(
      factor.updated_at
        .getTime(),
      now.getTime(),
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      10,
    );

    const expectedHashes =
      new Set(
        result.recoveryCodes.map(
          (code) =>
            hashRecoveryCodeForLookup(
              code,
              TEST_RECOVERY_HMAC_KEY,
            ),
        ),
      );

    const persistedHashes =
      new Set(
        recoveries.map(
          (row) =>
            row.code_hash,
        ),
      );

    assert.deepEqual(
      persistedHashes,
      expectedHashes,
    );

    for (
      const row of recoveries
    ) {
      assert.match(
        row.code_hash,
        /^[0-9a-f]{64}$/u,
      );

      assert.equal(
        result.recoveryCodes.includes(
          row.code_hash,
        ),
        false,
      );

      assert.equal(
        row.created_at
          .getTime(),
        now.getTime(),
      );

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

    const session =
      sessions[0];

    assert.equal(
      session.token_hash,
      hashOpaqueAuthToken(
        result.sessionToken,
      ),
    );

    assert.notEqual(
      session.token_hash,
      result.sessionToken,
    );

    assert.equal(
      session.auth_method,
      'totp',
    );

    assert.equal(
      session.created_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      session.last_seen_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      session.idle_expires_at
        .getTime(),
      now.getTime() +
        30 * 60 * 1000,
    );

    assert.equal(
      session.absolute_expires_at
        .getTime(),
      now.getTime() +
        8 * 60 * 60 * 1000,
    );

    assert.equal(
      session.revoked_at,
      null,
    );

    assert.equal(
      session.revocation_reason,
      null,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge
        .consumed_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      persistedChallenge
        .invalidated_at,
      null,
    );

    const persistedAdmin =
      await adminState(
        admin.id,
      );

    assert.equal(
      persistedAdmin
        .last_login_at
        .getTime(),
      now.getTime(),
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
      accountThrottle
        .failure_count,
      0,
    );

    assert.equal(
      accountThrottle
        .last_failure_at,
      null,
    );

    assert.equal(
      accountThrottle
        .blocked_until,
      null,
    );

    assert.equal(
      ipThrottle
        .failure_count,
      0,
    );

    assert.equal(
      ipThrottle
        .last_failure_at,
      null,
    );

    assert.equal(
      ipThrottle
        .blocked_until,
      null,
    );
  },
);

test(
  'malformed TOTP is invalid_second_factor and atomically advances the challenge plus both MFA throttles without creating privileged state',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:10:00.000Z',
      );

    const clientIp =
      '203.0.113.62';

    const admin =
      await insertAdmin({
        email:
          'confirm-invalid@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    await insertTotpFactor({
      adminId:
        admin.id,
      now,
    });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const result =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          'not-six-digits',
        clientIp,
        now,
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      1,
    );

    assert.equal(
      persistedChallenge
        .consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge
        .invalidated_at,
      null,
    );

    const account =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ip =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      account.failure_count,
      1,
    );

    assert.equal(
      ip.failure_count,
      1,
    );

    assert.equal(
      account.blocked_until,
      null,
    );

    assert.equal(
      ip.blocked_until,
      null,
    );

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      factor.confirmed_at,
      null,
    );

    assert.equal(
      factor.last_used_counter,
      null,
    );

    assert.equal(
      await countAdminRows(
        'admin_sessions',
        admin.id,
      ),
      0,
    );

    assert.equal(
      await countAdminRows(
        'admin_recovery_codes',
        admin.id,
      ),
      0,
    );

    assert.equal(
      (
        await adminState(
          admin.id,
        )
      ).last_login_at,
      null,
    );
  },
);

test(
  'replayed persisted TOTP counter fails as invalid_second_factor without confirming the factor',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:20:00.000Z',
      );

    const clientIp =
      '203.0.113.63';

    const admin =
      await insertAdmin({
        email:
          'confirm-replay@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const secret =
      generateTotpSecret();

    const token =
      createTotpToken(
        secret,
        now,
      );

    const current =
      verifyTotpToken({
        secret,
        token,
        timestamp:
          now.getTime(),
        lastUsedCounter:
          null,
      });

    assert.equal(
      current.valid,
      true,
    );

    await insertTotpFactor({
      adminId:
        admin.id,
      now,
      secret,
      lastUsedCounter:
        current.counter,
    });

    mfaKeys(
      admin.id,
      clientIp,
    );

    const result =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          token,
        clientIp,
        now,
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    assert.equal(
      (
        await challengeState(
          challenge.id,
        )
      ).attempt_count,
      1,
    );

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      factor.confirmed_at,
      null,
    );

    assert.equal(
      Number(
        factor.last_used_counter,
      ),
      current.counter,
    );

    assert.equal(
      await countAdminRows(
        'admin_sessions',
        admin.id,
      ),
      0,
    );
  },
);

test(
  'fifth second-factor failure invalidates the challenge and a later valid token fails as invalid_challenge without further throttle mutation',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:30:00.000Z',
      );

    const clientIp =
      '203.0.113.64';

    const admin =
      await insertAdmin({
        email:
          'confirm-exhaust@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
        attemptCount:
          4,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const fifth =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          'bad',
        clientIp,
        now,
      });

    assert.deepEqual(
      fifth,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const exhausted =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      exhausted.attempt_count,
      5,
    );

    assert.equal(
      exhausted
        .invalidated_at
        .getTime(),
      now.getTime(),
    );

    const accountBefore =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipBefore =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    const later =
      new Date(
        now.getTime() +
          1000,
      );

    const validToken =
      createTotpToken(
        secret,
        later,
      );

    const next =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          validToken,
        clientIp,
        now:
          later,
      });

    assert.deepEqual(
      next,
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    const accountAfter =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipAfter =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountAfter.failure_count,
      accountBefore.failure_count,
    );

    assert.equal(
      ipAfter.failure_count,
      ipBefore.failure_count,
    );
  },
);

test(
  'MFA account threshold is triggered on the fifth failure and the next active-challenge attempt is throttled without consuming another challenge attempt',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:40:00.000Z',
      );

    const clientIp =
      '203.0.113.65';

    const admin =
      await insertAdmin({
        email:
          'confirm-account-throttle@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const windowStart =
      new Date(
        now.getTime() -
          60 * 1000,
      );

    await insertThrottle({
      scope:
        'mfa_account',
      keyHash:
        keys.account,
      failureCount:
        4,
      now:
        windowStart,
    });

    const threshold =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          'bad',
        clientIp,
        now,
      });

    assert.deepEqual(
      threshold,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const account =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    assert.equal(
      account.failure_count,
      5,
    );

    assert.equal(
      account.blocked_until
        .getTime(),
      now.getTime() +
        15 * 60 * 1000,
    );

    assert.equal(
      (
        await challengeState(
          challenge.id,
        )
      ).attempt_count,
      1,
    );

    const later =
      new Date(
        now.getTime() +
          1000,
      );

    const blocked =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          createTotpToken(
            secret,
            later,
          ),
        clientIp,
        now:
          later,
      });

    assert.deepEqual(
      blocked,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    assert.equal(
      (
        await challengeState(
          challenge.id,
        )
      ).attempt_count,
      1,
    );

    assert.equal(
      (
        await throttleState(
          'mfa_account',
          keys.account,
        )
      ).failure_count,
      5,
    );

    assert.equal(
      (
        await factorState(
          admin.id,
        )
      ).confirmed_at,
      null,
    );
  },
);

test(
  'MFA IP threshold is triggered on the twentieth failure and the next active-challenge attempt is throttled without another failure increment',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:50:00.000Z',
      );

    const clientIp =
      '203.0.113.66';

    const admin =
      await insertAdmin({
        email:
          'confirm-ip-throttle@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const windowStart =
      new Date(
        now.getTime() -
          60 * 1000,
      );

    await insertThrottle({
      scope:
        'mfa_ip',
      keyHash:
        keys.ip,
      failureCount:
        19,
      now:
        windowStart,
    });

    const threshold =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          'bad',
        clientIp,
        now,
      });

    assert.deepEqual(
      threshold,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const ip =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      ip.failure_count,
      20,
    );

    assert.equal(
      ip.blocked_until
        .getTime(),
      now.getTime() +
        15 * 60 * 1000,
    );

    const later =
      new Date(
        now.getTime() +
          1000,
      );

    const blocked =
      await confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          createTotpToken(
            secret,
            later,
          ),
        clientIp,
        now:
          later,
      });

    assert.deepEqual(
      blocked,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    assert.equal(
      (
        await challengeState(
          challenge.id,
        )
      ).attempt_count,
      1,
    );

    assert.equal(
      (
        await throttleState(
          'mfa_ip',
          keys.ip,
        )
      ).failure_count,
      20,
    );
  },
);

test(
  'missing expired consumed invalidated and wrong-type challenges all fail as invalid_challenge without MFA throttle or privileged-state mutation',
  async () => {
    const now =
      new Date(
        '2026-08-29T19:00:00.000Z',
      );

    const missing =
      await confirmAdminTotpEnrollment({
        challengeToken:
          generateOpaqueAuthToken(),
        totpToken:
          'bad',
        clientIp:
          '203.0.113.67',
        now,
      });

    assert.deepEqual(
      missing,
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    const scenarios = [
      {
        name:
          'expired',
        type:
          'enrollment',
        createdAt:
          new Date(
            now.getTime() -
              10 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() -
              5 * 60 * 1000,
          ),
        consumedAt:
          null,
        invalidatedAt:
          null,
      },
      {
        name:
          'consumed',
        type:
          'enrollment',
        createdAt:
          new Date(
            now.getTime() -
              2 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() +
              3 * 60 * 1000,
          ),
        consumedAt:
          new Date(
            now.getTime() -
              60 * 1000,
          ),
        invalidatedAt:
          null,
      },
      {
        name:
          'invalidated',
        type:
          'enrollment',
        createdAt:
          new Date(
            now.getTime() -
              2 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() +
              3 * 60 * 1000,
          ),
        consumedAt:
          null,
        invalidatedAt:
          new Date(
            now.getTime() -
              60 * 1000,
          ),
      },
      {
        name:
          'wrong-type',
        type:
          'mfa',
        createdAt:
          now,
        expiresAt:
          new Date(
            now.getTime() +
              5 * 60 * 1000,
          ),
        consumedAt:
          null,
        invalidatedAt:
          null,
      },
    ];

    for (
      let index = 0;
      index <
        scenarios.length;
      index++
    ) {
      const scenario =
        scenarios[index];

      const admin =
        await insertAdmin({
          email:
            `confirm-challenge-${scenario.name}@example.com`,
          now:
            scenario.createdAt,
        });

      const challengeToken =
        generateOpaqueAuthToken();

      const challenge =
        await insertChallenge({
          adminId:
            admin.id,
          challengeToken,
          now:
            scenario.createdAt,
          type:
            scenario.type,
          expiresAt:
            scenario.expiresAt,
          consumedAt:
            scenario.consumedAt,
          invalidatedAt:
            scenario.invalidatedAt,
          createdAt:
            scenario.createdAt,
        });

      const result =
        await confirmAdminTotpEnrollment({
          challengeToken,
          totpToken:
            'bad',
          clientIp:
            `203.0.113.${70 + index}`,
          now,
        });

      assert.deepEqual(
        result,
        {
          ok: false,
          reason:
            'invalid_challenge',
        },
        scenario.name,
      );

      const persisted =
        await challengeState(
          challenge.id,
        );

      assert.equal(
        persisted.attempt_count,
        0,
        scenario.name,
      );

      assert.equal(
        await countAdminRows(
          'admin_sessions',
          admin.id,
        ),
        0,
        scenario.name,
      );

      assert.equal(
        await countAdminRows(
          'admin_recovery_codes',
          admin.id,
        ),
        0,
        scenario.name,
      );
    }
  },
);

test(
  'disabled admin missing factor and already-confirmed factor fail closed as invalid_challenge without challenge-attempt consumption',
  async () => {
    const now =
      new Date(
        '2026-08-29T19:10:00.000Z',
      );

    const cases = [
      {
        name:
          'disabled',
        isActive:
          false,
        factor:
          'unconfirmed',
      },
      {
        name:
          'missing-factor',
        isActive:
          true,
        factor:
          'missing',
      },
      {
        name:
          'confirmed-factor',
        isActive:
          true,
        factor:
          'confirmed',
      },
    ];

    for (
      let index = 0;
      index < cases.length;
      index++
    ) {
      const scenario =
        cases[index];

      const admin =
        await insertAdmin({
          email:
            `confirm-state-${scenario.name}@example.com`,
          now,
          isActive:
            scenario.isActive,
        });

      const challengeToken =
        generateOpaqueAuthToken();

      const challenge =
        await insertChallenge({
          adminId:
            admin.id,
          challengeToken,
          now,
      });

      if (
        scenario.factor ===
          'unconfirmed'
      ) {
        await insertTotpFactor({
          adminId:
            admin.id,
          now,
        });
      }

      if (
        scenario.factor ===
          'confirmed'
      ) {
        await insertTotpFactor({
          adminId:
            admin.id,
          now,
          confirmedAt:
            now,
          lastUsedCounter:
            123,
        });
      }

      const result =
        await confirmAdminTotpEnrollment({
          challengeToken,
          totpToken:
            'bad',
          clientIp:
            `203.0.113.${80 + index}`,
          now,
        });

      assert.deepEqual(
        result,
        {
          ok: false,
          reason:
            'invalid_challenge',
        },
        scenario.name,
      );

      const persisted =
        await challengeState(
          challenge.id,
        );

      assert.equal(
        persisted.attempt_count,
        0,
        scenario.name,
      );

      assert.equal(
        persisted.consumed_at,
        null,
        scenario.name,
      );

      assert.equal(
        await countAdminRows(
          'admin_sessions',
          admin.id,
        ),
        0,
        scenario.name,
      );

      assert.equal(
        await countAdminRows(
          'admin_recovery_codes',
          admin.id,
        ),
        0,
        scenario.name,
      );
    }
  },
);

test(
  'concurrent confirmation attempts serialize so exactly one consumes the challenge and creates one complete privileged state',
  async () => {
    const now =
      new Date(
        '2026-08-29T19:20:00.000Z',
      );

    const clientIp =
      '203.0.113.90';

    const admin =
      await insertAdmin({
        email:
          'confirm-concurrent@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
      });

    mfaKeys(
      admin.id,
      clientIp,
    );

    const token =
      createTotpToken(
        secret,
        now,
      );

    const results =
      await Promise.all([
        confirmAdminTotpEnrollment({
          challengeToken,
          totpToken:
            token,
          clientIp,
          now,
        }),
        confirmAdminTotpEnrollment({
          challengeToken,
          totpToken:
            token,
          clientIp,
          now,
        }),
      ]);

    const successes =
      results.filter(
        (result) =>
          result.ok,
      );

    const failures =
      results.filter(
        (result) =>
          !result.ok,
      );

    assert.equal(
      successes.length,
      1,
    );

    assert.equal(
      failures.length,
      1,
    );

    assert.deepEqual(
      failures[0],
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    assert.equal(
      (
        await sessionRows(
          admin.id,
        )
      ).length,
      1,
    );

    assert.equal(
      (
        await recoveryRows(
          admin.id,
        )
      ).length,
      10,
    );

    const factor =
      await factorState(
        admin.id,
      );

    assert.ok(
      factor.confirmed_at,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.ok(
      persistedChallenge
        .consumed_at,
    );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );
  },
);

test(
  'noncanonical client IP is rejected before any enrollment-confirmation database mutation',
  async () => {
    const now =
      new Date(
        '2026-08-29T19:30:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'confirm-ip-validation@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    await insertTotpFactor({
      adminId:
        admin.id,
      now,
    });

    await assert.rejects(
      confirmAdminTotpEnrollment({
        challengeToken,
        totpToken:
          'bad',
        clientIp:
          ' 203.0.113.100 ',
        now,
      }),
      /Client IP/u,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge
        .consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge
        .invalidated_at,
      null,
    );

    assert.equal(
      await countAdminRows(
        'admin_sessions',
        admin.id,
      ),
      0,
    );

    assert.equal(
      await countAdminRows(
        'admin_recovery_codes',
        admin.id,
      ),
      0,
    );
  },
);
