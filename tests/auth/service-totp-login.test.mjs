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
    completeAdminTotpLogin,
  },
  {
    closeDatabase,
  },
  {
    hashPassword,
  },
  {
    hashAuthThrottleKey,
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
  type = 'mfa',
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
  confirmedAt = now,
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

function currentTotpCounter(
  now,
) {
  return Math.floor(
    now.getTime() /
      1000 /
      30,
  );
}

test(
  'successful ordinary TOTP MFA login atomically advances the confirmed factor counter creates one TOTP session consumes the challenge resets MFA throttles and updates last login without provisioning recovery codes',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:00:15.000Z',
      );

    const clientIp =
      '203.0.113.120';

    const admin =
      await insertAdmin({
        email:
          'totp-login-success@example.com',
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

    await insertThrottle({
      scope:
        'mfa_account',
      keyHash:
        keys.account,
      failureCount: 2,
      now,
    });

    await insertThrottle({
      scope:
        'mfa_ip',
      keyHash:
        keys.ip,
      failureCount: 3,
      now,
    });

    const token =
      createTotpToken(
        secret,
        now,
      );

    const beforeFactor =
      await factorState(
        admin.id,
      );

    assert.ok(
      beforeFactor.confirmed_at,
    );

    assert.equal(
      beforeFactor.last_used_counter,
      null,
    );

    const result =
      await completeAdminTotpLogin({
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

    assert.equal(
      result.admin.id,
      admin.id,
    );

    assert.equal(
      result.admin.email,
      admin.email,
    );

    assert.equal(
      typeof result.sessionToken,
      'string',
    );

    const expectedCounter =
      currentTotpCounter(
        now,
      );

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      Number(
        factor.last_used_counter,
      ),
      expectedCounter,
    );

    assert.equal(
      factor.confirmed_at
        .getTime(),
      beforeFactor.confirmed_at
        .getTime(),
    );

    const challengeAfter =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfter.attempt_count,
      0,
    );

    assert.equal(
      challengeAfter.invalidated_at,
      null,
    );

    assert.equal(
      challengeAfter.consumed_at
        .getTime(),
      now.getTime(),
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
      sessions[0].token_hash,
      hashOpaqueAuthToken(
        result.sessionToken,
      ),
    );

    assert.equal(
      sessions[0].auth_method,
      'totp',
    );

    assert.equal(
      sessions[0].created_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      sessions[0].last_seen_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      sessions[0].idle_expires_at
        .getTime(),
      now.getTime() +
        30 * 60 * 1000,
    );

    assert.equal(
      sessions[0].absolute_expires_at
        .getTime(),
      now.getTime() +
        8 * 60 * 60 * 1000,
    );

    assert.equal(
      sessions[0].revoked_at,
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

    const adminAfter =
      await adminState(
        admin.id,
      );

    assert.equal(
      adminAfter.last_login_at
        .getTime(),
      now.getTime(),
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
  'malformed ordinary TOTP is invalid_second_factor and atomically advances the challenge plus both MFA throttles without advancing the factor counter or creating a session',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:10:15.000Z',
      );

    const clientIp =
      '203.0.113.121';

    const admin =
      await insertAdmin({
        email:
          'totp-login-invalid@example.com',
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
      await completeAdminTotpLogin({
        challengeToken,
        totpToken:
          'bad',
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

    const state =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      state.attempt_count,
      1,
    );

    assert.equal(
      state.consumed_at,
      null,
    );

    assert.equal(
      state.invalidated_at,
      null,
    );

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      factor.last_used_counter,
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
  'persisted TOTP replay counter is rejected as invalid_second_factor and does not advance the factor or create privileged state',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:20:15.000Z',
      );

    const clientIp =
      '203.0.113.122';

    const admin =
      await insertAdmin({
        email:
          'totp-login-replay@example.com',
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

    const counter =
      currentTotpCounter(
        now,
      );

    const {
      secret,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
        lastUsedCounter:
          counter,
      });

    const token =
      createTotpToken(
        secret,
        now,
      );

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const result =
      await completeAdminTotpLogin({
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

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      Number(
        factor.last_used_counter,
      ),
      counter,
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
        await challengeState(
          challenge.id,
        )
      ).attempt_count,
      1,
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
      account.blocked_until,
      null,
    );

    assert.equal(
      ip.failure_count,
      1,
    );

    assert.equal(
      ip.blocked_until,
      null,
    );
  },
);

test(
  'fifth ordinary TOTP failure invalidates the MFA challenge and a later valid token returns invalid_challenge without further throttle mutation',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:30:15.000Z',
      );

    const later =
      new Date(
        now.getTime() +
          1000,
      );

    const clientIp =
      '203.0.113.123';

    const admin =
      await insertAdmin({
        email:
          'totp-login-exhaust@example.com',
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
        attemptCount: 4,
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
      await completeAdminTotpLogin({
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

    const afterFifth =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      afterFifth.attempt_count,
      5,
    );

    assert.equal(
      afterFifth.invalidated_at
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

    const next =
      await completeAdminTotpLogin({
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
  'MFA account threshold is triggered by the fifth failure and the next active ordinary-TOTP attempt is throttled without consuming another challenge attempt',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:40:15.000Z',
      );

    const later =
      new Date(
        now.getTime() +
          1000,
      );

    const clientIp =
      '203.0.113.124';

    const admin =
      await insertAdmin({
        email:
          'totp-login-account-throttle@example.com',
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

    await insertThrottle({
      scope:
        'mfa_account',
      keyHash:
        keys.account,
      failureCount: 4,
      now,
    });

    const threshold =
      await completeAdminTotpLogin({
        challengeToken,
        totpToken:
          'bad',
        clientIp,
        now,
      });

    assert.equal(
      threshold.reason,
      'invalid_second_factor',
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

    const challengeBeforeBlocked =
      await challengeState(
        challenge.id,
      );

    const blocked =
      await completeAdminTotpLogin({
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

    assert.equal(
      blocked.reason,
      'throttled',
    );

    const challengeAfterBlocked =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterBlocked.attempt_count,
      challengeBeforeBlocked.attempt_count,
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
  },
);

test(
  'MFA IP threshold is triggered by the twentieth failure and the next active ordinary-TOTP attempt is throttled without another failure increment',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:50:15.000Z',
      );

    const later =
      new Date(
        now.getTime() +
          1000,
      );

    const clientIp =
      '203.0.113.125';

    const admin =
      await insertAdmin({
        email:
          'totp-login-ip-throttle@example.com',
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

    await insertThrottle({
      scope:
        'mfa_ip',
      keyHash:
        keys.ip,
      failureCount: 19,
      now,
    });

    const threshold =
      await completeAdminTotpLogin({
        challengeToken,
        totpToken:
          'bad',
        clientIp,
        now,
      });

    assert.equal(
      threshold.reason,
      'invalid_second_factor',
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

    const challengeBeforeBlocked =
      await challengeState(
        challenge.id,
      );

    const blocked =
      await completeAdminTotpLogin({
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

    assert.equal(
      blocked.reason,
      'throttled',
    );

    assert.equal(
      (
        await challengeState(
          challenge.id,
        )
      ).attempt_count,
      challengeBeforeBlocked.attempt_count,
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
  'missing expired consumed invalidated and enrollment challenges independently fail as invalid_challenge without ordinary-MFA throttle session or factor-counter mutation',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:00:15.000Z',
      );

    const cases = [
      {
        name:
          'missing',
        insert: false,
      },
      {
        name:
          'expired',
        insert: true,
        createdAt:
          new Date(
            now.getTime() -
              5 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() - 1,
          ),
      },
      {
        name:
          'consumed',
        insert: true,
        createdAt:
          new Date(
            now.getTime() - 1000,
          ),
        consumedAt:
          new Date(
            now.getTime() - 1,
          ),
      },
      {
        name:
          'invalidated',
        insert: true,
        createdAt:
          new Date(
            now.getTime() - 1000,
          ),
        invalidatedAt:
          new Date(
            now.getTime() - 1,
          ),
      },
      {
        name:
          'wrong-type',
        insert: true,
        type:
          'enrollment',
      },
    ];

    for (
      let index = 0;
      index < cases.length;
      index += 1
    ) {
      const item =
        cases[index];

      const clientIp =
        `203.0.113.${130 + index}`;

      const admin =
        await insertAdmin({
          email:
            `totp-login-challenge-${item.name}@example.com`,
          now,
        });

      await insertTotpFactor({
        adminId:
          admin.id,
        now,
      });

      const challengeToken =
        generateOpaqueAuthToken();

      let challenge =
        null;

      if (item.insert) {
        challenge =
          await insertChallenge({
            adminId:
              admin.id,
            challengeToken,
            now,
            expiresAt:
              item.expiresAt,
            createdAt:
              item.createdAt ??
                now,
            consumedAt:
              item.consumedAt,
            invalidatedAt:
              item.invalidatedAt,
            type:
              item.type ?? 'mfa',
          });
      }

      const keys =
        mfaKeys(
          admin.id,
          clientIp,
        );

      const result =
        await completeAdminTotpLogin({
          challengeToken,
          totpToken:
            'bad',
          clientIp,
          now,
        });

      assert.deepEqual(
        result,
        {
          ok: false,
          reason:
            'invalid_challenge',
        },
      );

      if (challenge) {
        const state =
          await challengeState(
            challenge.id,
          );

        assert.equal(
          state.attempt_count,
          0,
        );
      }

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
          await factorState(
            admin.id,
          )
        ).last_used_counter,
        null,
      );

      assert.equal(
        (
          await recoveryRows(
            admin.id,
          )
        ).length,
        0,
      );

      assert.equal(
        await throttleState(
          'mfa_account',
          keys.account,
        ),
        null,
      );

      assert.equal(
        await throttleState(
          'mfa_ip',
          keys.ip,
        ),
        null,
      );
    }
  },
);

test(
  'disabled admin missing TOTP factor and unconfirmed TOTP factor fail closed as invalid_challenge without consuming an MFA challenge attempt',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:10:15.000Z',
      );

    const scenarios = [];

    const disabled =
      await insertAdmin({
        email:
          'totp-login-disabled@example.com',
        now,
        isActive: false,
      });

    const disabledToken =
      generateOpaqueAuthToken();

    const disabledChallenge =
      await insertChallenge({
        adminId:
          disabled.id,
        challengeToken:
          disabledToken,
        now,
      });

    await insertTotpFactor({
      adminId:
        disabled.id,
      now,
    });

    scenarios.push({
      admin:
        disabled,
      challenge:
        disabledChallenge,
      challengeToken:
        disabledToken,
    });

    const missing =
      await insertAdmin({
        email:
          'totp-login-missing-factor@example.com',
        now,
      });

    const missingToken =
      generateOpaqueAuthToken();

    const missingChallenge =
      await insertChallenge({
        adminId:
          missing.id,
        challengeToken:
          missingToken,
        now,
      });

    scenarios.push({
      admin:
        missing,
      challenge:
        missingChallenge,
      challengeToken:
        missingToken,
    });

    const unconfirmed =
      await insertAdmin({
        email:
          'totp-login-unconfirmed@example.com',
        now,
      });

    const unconfirmedToken =
      generateOpaqueAuthToken();

    const unconfirmedChallenge =
      await insertChallenge({
        adminId:
          unconfirmed.id,
        challengeToken:
          unconfirmedToken,
        now,
      });

    await insertTotpFactor({
      adminId:
        unconfirmed.id,
      now,
      confirmedAt:
        null,
    });

    scenarios.push({
      admin:
        unconfirmed,
      challenge:
        unconfirmedChallenge,
      challengeToken:
        unconfirmedToken,
    });

    for (
      let index = 0;
      index < scenarios.length;
      index += 1
    ) {
      const scenario =
        scenarios[index];

      const result =
        await completeAdminTotpLogin({
          challengeToken:
            scenario.challengeToken,
          totpToken:
            'bad',
          clientIp:
            `203.0.113.${140 + index}`,
          now,
        });

      assert.deepEqual(
        result,
        {
          ok: false,
          reason:
            'invalid_challenge',
        },
      );

      assert.equal(
        (
          await challengeState(
            scenario.challenge.id,
          )
        ).attempt_count,
        0,
      );

      assert.equal(
        (
          await sessionRows(
            scenario.admin.id,
          )
        ).length,
        0,
      );
    }
  },
);

test(
  'concurrent ordinary TOTP logins on the same active MFA challenge serialize so exactly one succeeds and the second observes the consumed challenge',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:20:15.000Z',
      );

    const clientIp =
      '203.0.113.150';

    const admin =
      await insertAdmin({
        email:
          'totp-login-race@example.com',
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

    const totpToken =
      createTotpToken(
        secret,
        now,
      );

    const results =
      await Promise.all([
        completeAdminTotpLogin({
          challengeToken,
          totpToken,
          clientIp,
          now,
        }),

        completeAdminTotpLogin({
          challengeToken,
          totpToken,
          clientIp,
          now,
        }),
      ]);

    assert.equal(
      results.filter(
        (result) =>
          result.ok,
      ).length,
      1,
    );

    assert.equal(
      results.filter(
        (result) =>
          !result.ok &&
          result.reason ===
            'invalid_challenge',
      ).length,
      1,
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
      'totp',
    );

    const factor =
      await factorState(
        admin.id,
      );

    assert.equal(
      Number(
        factor.last_used_counter,
      ),
      currentTotpCounter(
        now,
      ),
    );

    const challengeAfter =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfter.attempt_count,
      0,
    );

    assert.equal(
      challengeAfter.invalidated_at,
      null,
    );

    assert.equal(
      challengeAfter.consumed_at
        .getTime(),
      now.getTime(),
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
  'noncanonical client IP is rejected before any ordinary TOTP MFA database mutation',
  async () => {
    const now =
      new Date(
        '2026-08-29T18:30:15.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'totp-login-client-ip@example.com',
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
      completeAdminTotpLogin({
        challengeToken,
        totpToken:
          'bad',
        clientIp:
          ' 203.0.113.160 ',
        now,
      }),
      /Client IP/u,
    );

    const challengeAfter =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfter.attempt_count,
      0,
    );

    assert.equal(
      challengeAfter.consumed_at,
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
        await factorState(
          admin.id,
        )
      ).last_used_counter,
      null,
    );
  },
);
