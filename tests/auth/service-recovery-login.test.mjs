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
    completeAdminRecoveryLogin,
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

async function insertRecoveryCode({
  adminId,
  recoveryCode,
  now,
  createdAt = now,
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
        ${createdAt},
        ${usedAt},
        ${revokedAt}
      )
      returning
        id,
        code_hash
    `;

  return row;
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

test(
  'successful recovery-code MFA login atomically consumes one active recovery code creates one recovery-authenticated session consumes the challenge resets MFA throttles and updates last login',
  async () => {
    const now =
      new Date(
        '2026-08-30T00:00:00.000Z',
      );

    const clientIp =
      '203.0.113.101';

    const admin =
      await insertAdmin({
        email:
          'recovery-success@example.com',
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

    const recoveryCode =
      'S'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
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
      failureCount:
        2,
      now,
    });

    await insertThrottle({
      scope:
        'mfa_ip',
      keyHash:
        keys.ip,
      failureCount:
        3,
      now,
    });

    const result =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode,
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

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      recoveries[0].revoked_at,
      null,
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
      challengeAfter.consumed_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      challengeAfter.invalidated_at,
      null,
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

    assert.notEqual(
      sessions[0].token_hash,
      result.sessionToken,
    );

    assert.equal(
      sessions[0].auth_method,
      'recovery',
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
  },
);
test(
  'malformed recovery code is invalid_second_factor and atomically advances the challenge plus both MFA throttles without recovery consumption session creation or last-login mutation',
  async () => {
    const now =
      new Date(
        '2026-08-30T00:10:00.000Z',
      );

    const clientIp =
      '203.0.113.102';

    const admin =
      await insertAdmin({
        email:
          'recovery-malformed@example.com',
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

    const recoveryCode =
      'M'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
      now,
    });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const result =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode:
          'not-valid',
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

    const challengeAfter =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfter.attempt_count,
      1,
    );

    assert.equal(
      challengeAfter.consumed_at,
      null,
    );

    assert.equal(
      challengeAfter.invalidated_at,
      null,
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at,
      null,
    );

    assert.equal(
      recoveries[0].revoked_at,
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
        await adminState(
          admin.id,
        )
      ).last_login_at,
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
      1,
    );

    assert.equal(
      ipThrottle.failure_count,
      1,
    );

    assert.equal(
      accountThrottle.blocked_until,
      null,
    );

    assert.equal(
      ipThrottle.blocked_until,
      null,
    );
  },
);
test(
  'missing used revoked and wrong-owner recovery codes are indistinguishable invalid_second_factor failures and never consume another admins recovery code',
  async () => {
    const now =
      new Date(
        '2026-08-30T00:20:00.000Z',
      );

    const scenarios = [
      {
        name:
          'missing',
        recoveryCode:
          'B'.repeat(22),
      },
      {
        name:
          'used',
        recoveryCode:
          'C'.repeat(22),
        usedAt:
          new Date(
            now.getTime() - 1,
          ),
      },
      {
        name:
          'revoked',
        recoveryCode:
          'D'.repeat(22),
        revokedAt:
          new Date(
            now.getTime() - 1,
          ),
      },
      {
        name:
          'wrong-owner',
        recoveryCode:
          'E'.repeat(22),
        wrongOwner:
          true,
      },
    ];

    for (
      let index = 0;
      index < scenarios.length;
      index++
    ) {
      const scenario =
        scenarios[index];

      const clientIp =
        `203.0.113.${110 + index}`;

      const admin =
        await insertAdmin({
          email:
            `recovery-${scenario.name}@example.com`,
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

      let owner =
        admin;

      if (scenario.wrongOwner) {
        owner =
          await insertAdmin({
            email:
              `recovery-foreign-owner-${index}@example.com`,
            now,
          });
      }

      if (
        scenario.name !==
        'missing'
      ) {
        await insertRecoveryCode({
          adminId:
            owner.id,
          recoveryCode:
            scenario.recoveryCode,
          now,
          createdAt:
            (
              scenario.usedAt ||
              scenario.revokedAt
            )
              ? new Date(
                  now.getTime() -
                    1000,
                )
              : now,
          usedAt:
            scenario.usedAt ??
              null,
          revokedAt:
            scenario.revokedAt ??
              null,
        });
      }

      const keys =
        mfaKeys(
          admin.id,
          clientIp,
        );

      const result =
        await completeAdminRecoveryLogin({
          challengeToken,
          recoveryCode:
            scenario.recoveryCode,
          clientIp,
          now,
        });

      assert.deepEqual(
        result,
        {
          ok:
            false,
          reason:
            'invalid_second_factor',
        },
        scenario.name,
      );

      const challengeAfter =
        await challengeState(
          challenge.id,
        );

      assert.equal(
        challengeAfter.attempt_count,
        1,
        scenario.name,
      );

      assert.equal(
        challengeAfter.consumed_at,
        null,
        scenario.name,
      );

      assert.equal(
        challengeAfter.invalidated_at,
        null,
        scenario.name,
      );

      assert.equal(
        (
          await sessionRows(
            admin.id,
          )
        ).length,
        0,
        scenario.name,
      );

      assert.equal(
        (
          await adminState(
            admin.id,
          )
        ).last_login_at,
        null,
        scenario.name,
      );

      assert.equal(
        (
          await throttleState(
            'mfa_account',
            keys.account,
          )
        ).failure_count,
        1,
        scenario.name,
      );

      assert.equal(
        (
          await throttleState(
            'mfa_ip',
            keys.ip,
          )
        ).failure_count,
        1,
        scenario.name,
      );

      if (
        scenario.name !==
        'missing'
      ) {
        const rows =
          await recoveryRows(
            owner.id,
          );

        assert.equal(
          rows.length,
          1,
          scenario.name,
        );

        if (
          scenario.name ===
          'used'
        ) {
          assert.equal(
            rows[0].used_at
              .getTime(),
            scenario.usedAt
              .getTime(),
            scenario.name,
          );
        } else {
          assert.equal(
            rows[0].used_at,
            null,
            scenario.name,
          );
        }

        if (
          scenario.name ===
          'revoked'
        ) {
          assert.equal(
            rows[0].revoked_at
              .getTime(),
            scenario.revokedAt
              .getTime(),
            scenario.name,
          );
        } else {
          assert.equal(
            rows[0].revoked_at,
            null,
            scenario.name,
          );
        }
      }
    }
  },
);
test(
  'fifth recovery second-factor failure invalidates the MFA challenge and a later valid recovery code returns invalid_challenge without further throttle mutation or recovery consumption',
  async () => {
    const now =
      new Date(
        '2026-08-30T00:30:00.000Z',
      );

    const clientIp =
      '203.0.113.120';

    const admin =
      await insertAdmin({
        email:
          'recovery-fifth-failure@example.com',
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

    const validRecoveryCode =
      'F'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode:
        validRecoveryCode,
      now,
    });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    for (
      let attempt = 1;
      attempt <= 5;
      attempt++
    ) {
      const result =
        await completeAdminRecoveryLogin({
          challengeToken,
          recoveryCode:
            'malformed',
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
        `failure ${attempt}`,
      );
    }

    const challengeAfterFailures =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterFailures.attempt_count,
      5,
    );

    assert.equal(
      challengeAfterFailures.consumed_at,
      null,
    );

    assert.ok(
      challengeAfterFailures.invalidated_at,
    );

    assert.equal(
      challengeAfterFailures.invalidated_at
        .getTime(),
      now.getTime(),
    );

    const accountBeforeLaterAttempt =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipBeforeLaterAttempt =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountBeforeLaterAttempt.failure_count,
      5,
    );

    assert.equal(
      ipBeforeLaterAttempt.failure_count,
      5,
    );

    assert.ok(
      accountBeforeLaterAttempt.blocked_until,
    );

    assert.equal(
      ipBeforeLaterAttempt.blocked_until,
      null,
    );

    const later =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode:
          validRecoveryCode,
        clientIp,
        now,
      });

    assert.deepEqual(
      later,
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    const challengeAfterLaterAttempt =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterLaterAttempt.attempt_count,
      5,
    );

    assert.equal(
      challengeAfterLaterAttempt.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterLaterAttempt.invalidated_at
        .getTime(),
      now.getTime(),
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at,
      null,
    );

    assert.equal(
      recoveries[0].revoked_at,
      null,
    );

    const accountAfterLaterAttempt =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipAfterLaterAttempt =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountAfterLaterAttempt.failure_count,
      accountBeforeLaterAttempt.failure_count,
    );

    assert.equal(
      ipAfterLaterAttempt.failure_count,
      ipBeforeLaterAttempt.failure_count,
    );

    assert.equal(
      accountAfterLaterAttempt.blocked_until
        .getTime(),
      accountBeforeLaterAttempt.blocked_until
        .getTime(),
    );

    assert.equal(
      ipAfterLaterAttempt.blocked_until,
      ipBeforeLaterAttempt.blocked_until,
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
        await adminState(
          admin.id,
        )
      ).last_login_at,
      null,
    );
  },
);
test(
  'MFA account threshold is triggered by a recovery failure and the next active-challenge attempt is throttled without consuming a valid recovery code',
  async () => {
    const now =
      new Date(
        '2026-08-30T00:40:00.000Z',
      );

    const clientIp =
      '203.0.113.121';

    const admin =
      await insertAdmin({
        email:
          'recovery-account-throttle@example.com',
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

    const recoveryCode =
      'G'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
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
      failureCount:
        4,
      now,
    });

    const triggering =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode:
          'malformed',
        clientIp,
        now,
      });

    assert.deepEqual(
      triggering,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const challengeAfterTrigger =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterTrigger.attempt_count,
      1,
    );

    assert.equal(
      challengeAfterTrigger.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterTrigger.invalidated_at,
      null,
    );

    const accountAfterTrigger =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipAfterTrigger =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountAfterTrigger.failure_count,
      5,
    );

    assert.ok(
      accountAfterTrigger.blocked_until,
    );

    assert.equal(
      ipAfterTrigger.failure_count,
      1,
    );

    assert.equal(
      ipAfterTrigger.blocked_until,
      null,
    );

    const blocked =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode,
        clientIp,
        now,
      });

    assert.deepEqual(
      blocked,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    const challengeAfterBlocked =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterBlocked.attempt_count,
      1,
    );

    assert.equal(
      challengeAfterBlocked.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterBlocked.invalidated_at,
      null,
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at,
      null,
    );

    const accountAfterBlocked =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipAfterBlocked =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountAfterBlocked.failure_count,
      accountAfterTrigger.failure_count,
    );

    assert.equal(
      accountAfterBlocked.blocked_until
        .getTime(),
      accountAfterTrigger.blocked_until
        .getTime(),
    );

    assert.equal(
      ipAfterBlocked.failure_count,
      ipAfterTrigger.failure_count,
    );

    assert.equal(
      ipAfterBlocked.blocked_until,
      ipAfterTrigger.blocked_until,
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
        await adminState(
          admin.id,
        )
      ).last_login_at,
      null,
    );
  },
);
test(
  'MFA IP threshold is triggered by a recovery failure and the next active-challenge attempt is throttled without another failure increment or recovery consumption',
  async () => {
    const now =
      new Date(
        '2026-08-30T00:50:00.000Z',
      );

    const clientIp =
      '203.0.113.122';

    const admin =
      await insertAdmin({
        email:
          'recovery-ip-throttle@example.com',
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

    const recoveryCode =
      'H'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
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
      failureCount:
        19,
      now,
    });

    const triggering =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode:
          'malformed',
        clientIp,
        now,
      });

    assert.deepEqual(
      triggering,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const challengeAfterTrigger =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterTrigger.attempt_count,
      1,
    );

    assert.equal(
      challengeAfterTrigger.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterTrigger.invalidated_at,
      null,
    );

    const accountAfterTrigger =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipAfterTrigger =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountAfterTrigger.failure_count,
      1,
    );

    assert.equal(
      accountAfterTrigger.blocked_until,
      null,
    );

    assert.equal(
      ipAfterTrigger.failure_count,
      20,
    );

    assert.ok(
      ipAfterTrigger.blocked_until,
    );

    const blocked =
      await completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode,
        clientIp,
        now,
      });

    assert.deepEqual(
      blocked,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    const challengeAfterBlocked =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterBlocked.attempt_count,
      1,
    );

    assert.equal(
      challengeAfterBlocked.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterBlocked.invalidated_at,
      null,
    );

    const accountAfterBlocked =
      await throttleState(
        'mfa_account',
        keys.account,
      );

    const ipAfterBlocked =
      await throttleState(
        'mfa_ip',
        keys.ip,
      );

    assert.equal(
      accountAfterBlocked.failure_count,
      accountAfterTrigger.failure_count,
    );

    assert.equal(
      accountAfterBlocked.blocked_until,
      accountAfterTrigger.blocked_until,
    );

    assert.equal(
      ipAfterBlocked.failure_count,
      ipAfterTrigger.failure_count,
    );

    assert.equal(
      ipAfterBlocked.blocked_until
        .getTime(),
      ipAfterTrigger.blocked_until
        .getTime(),
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at,
      null,
    );

    assert.equal(
      recoveries[0].revoked_at,
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
        await adminState(
          admin.id,
        )
      ).last_login_at,
      null,
    );
  },
);
test(
  'invalid recovery-login challenges and inactive admins take invalid_challenge precedence before recovery-code validation or MFA throttle mutation',
  async () => {
    const now =
      new Date(
        '2026-08-30T01:00:00.000Z',
      );

    const cases = [
      'missing',
      'enrollment',
      'expired',
      'consumed',
      'invalidated',
      'inactive-admin',
    ];

    for (
      let index = 0;
      index < cases.length;
      index++
    ) {
      const name =
        cases[index];

      const clientIp =
        `203.0.113.${130 + index}`;

      const admin =
        await insertAdmin({
          email:
            `recovery-invalid-challenge-${name}@example.com`,
          now,
          isActive:
            name !==
            'inactive-admin',
        });

      let challengeToken =
        generateOpaqueAuthToken();

      let challenge =
        null;

      if (
        name !==
        'missing'
      ) {
        const createdAt =
          name ===
          'expired'
            ? new Date(
                now.getTime() -
                  10 * 60 * 1000,
              )
            : new Date(
                now.getTime() -
                  2000,
              );

        challenge =
          await insertChallenge({
            adminId:
              admin.id,
            challengeToken,
            now,
            type:
              name ===
              'enrollment'
                ? 'enrollment'
                : 'mfa',
            createdAt,
            expiresAt:
              name ===
              'expired'
                ? new Date(
                    now.getTime() -
                      1000,
                  )
                : new Date(
                    now.getTime() +
                      5 * 60 * 1000,
                  ),
            consumedAt:
              name ===
              'consumed'
                ? new Date(
                    now.getTime() -
                      1000,
                  )
                : null,
            invalidatedAt:
              name ===
              'invalidated'
                ? new Date(
                    now.getTime() -
                      1000,
                  )
                : null,
          });
      }

      const keys =
        mfaKeys(
          admin.id,
          clientIp,
        );

      const result =
        await completeAdminRecoveryLogin({
          challengeToken,
          recoveryCode:
            'malformed',
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
        name,
      );

      assert.equal(
        await throttleState(
          'mfa_account',
          keys.account,
        ),
        null,
        `${name} account throttle`,
      );

      assert.equal(
        await throttleState(
          'mfa_ip',
          keys.ip,
        ),
        null,
        `${name} IP throttle`,
      );

      assert.equal(
        (
          await sessionRows(
            admin.id,
          )
        ).length,
        0,
        `${name} sessions`,
      );

      assert.equal(
        (
          await adminState(
            admin.id,
          )
        ).last_login_at,
        null,
        `${name} last login`,
      );

      if (challenge) {
        const state =
          await challengeState(
            challenge.id,
          );

        assert.equal(
          state.attempt_count,
          0,
          `${name} attempt count`,
        );

        if (
          name ===
          'consumed'
        ) {
          assert.equal(
            state.consumed_at
              .getTime(),
            now.getTime() -
              1000,
            name,
          );
        } else {
          assert.equal(
            state.consumed_at,
            null,
            name,
          );
        }

        if (
          name ===
          'invalidated'
        ) {
          assert.equal(
            state.invalidated_at
              .getTime(),
            now.getTime() -
              1000,
            name,
          );
        } else {
          assert.equal(
            state.invalidated_at,
            null,
            name,
          );
        }
      }
    }
  },
);
test(
  'a consumed recovery code replayed through a fresh active MFA challenge is invalid_second_factor and cannot create a second session or move last login',
  async () => {
    const firstNow =
      new Date(
        '2026-08-30T01:10:00.000Z',
      );

    const replayNow =
      new Date(
        '2026-08-30T01:11:00.000Z',
      );

    const clientIp =
      '203.0.113.140';

    const admin =
      await insertAdmin({
        email:
          'recovery-replay@example.com',
        now:
          firstNow,
      });

    const recoveryCode =
      'J'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
      now:
        firstNow,
    });

    const firstChallengeToken =
      generateOpaqueAuthToken();

    const firstChallenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken:
          firstChallengeToken,
        now:
          firstNow,
      });

    const firstResult =
      await completeAdminRecoveryLogin({
        challengeToken:
          firstChallengeToken,
        recoveryCode,
        clientIp,
        now:
          firstNow,
      });

    assert.equal(
      firstResult.ok,
      true,
    );

    const recoveryAfterSuccess =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveryAfterSuccess.length,
      1,
    );

    assert.equal(
      recoveryAfterSuccess[0].used_at
        .getTime(),
      firstNow.getTime(),
    );

    assert.equal(
      recoveryAfterSuccess[0].revoked_at,
      null,
    );

    const firstChallengeAfter =
      await challengeState(
        firstChallenge.id,
      );

    assert.equal(
      firstChallengeAfter.attempt_count,
      0,
    );

    assert.equal(
      firstChallengeAfter.consumed_at
        .getTime(),
      firstNow.getTime(),
    );

    assert.equal(
      firstChallengeAfter.invalidated_at,
      null,
    );

    const sessionsAfterSuccess =
      await sessionRows(
        admin.id,
      );

    assert.equal(
      sessionsAfterSuccess.length,
      1,
    );

    assert.equal(
      sessionsAfterSuccess[0].auth_method,
      'recovery',
    );

    const freshChallengeToken =
      generateOpaqueAuthToken();

    const freshChallenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken:
          freshChallengeToken,
        now:
          replayNow,
      });

    const keys =
      mfaKeys(
        admin.id,
        clientIp,
      );

    const replayResult =
      await completeAdminRecoveryLogin({
        challengeToken:
          freshChallengeToken,
        recoveryCode,
        clientIp,
        now:
          replayNow,
      });

    assert.deepEqual(
      replayResult,
      {
        ok: false,
        reason:
          'invalid_second_factor',
      },
    );

    const recoveryAfterReplay =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveryAfterReplay.length,
      1,
    );

    assert.equal(
      recoveryAfterReplay[0].used_at
        .getTime(),
      firstNow.getTime(),
    );

    assert.equal(
      recoveryAfterReplay[0].revoked_at,
      null,
    );

    const freshChallengeAfter =
      await challengeState(
        freshChallenge.id,
      );

    assert.equal(
      freshChallengeAfter.attempt_count,
      1,
    );

    assert.equal(
      freshChallengeAfter.consumed_at,
      null,
    );

    assert.equal(
      freshChallengeAfter.invalidated_at,
      null,
    );

    const sessionsAfterReplay =
      await sessionRows(
        admin.id,
      );

    assert.equal(
      sessionsAfterReplay.length,
      1,
    );

    assert.equal(
      sessionsAfterReplay[0].token_hash,
      sessionsAfterSuccess[0].token_hash,
    );

    const adminAfterReplay =
      await adminState(
        admin.id,
      );

    assert.equal(
      adminAfterReplay.last_login_at
        .getTime(),
      firstNow.getTime(),
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
      1,
    );

    assert.equal(
      accountThrottle.blocked_until,
      null,
    );

    assert.equal(
      ipThrottle.failure_count,
      1,
    );

    assert.equal(
      ipThrottle.blocked_until,
      null,
    );
  },
);
test(
  'concurrent recovery logins against the same active MFA challenge and recovery code yield exactly one success and one invalid_challenge with one recovery consumption and one session',
  async () => {
    const now =
      new Date(
        '2026-08-30T01:20:00.000Z',
      );

    const clientIp =
      '203.0.113.150';

    const admin =
      await insertAdmin({
        email:
          'recovery-concurrency@example.com',
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

    const recoveryCode =
      'K'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
      now,
    });

    const results =
      await Promise.all([
        completeAdminRecoveryLogin({
          challengeToken,
          recoveryCode,
          clientIp,
          now,
        }),
        completeAdminRecoveryLogin({
          challengeToken,
          recoveryCode,
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

    const success =
      successes[0];

    assert.equal(
      success.admin.id,
      admin.id,
    );

    assert.equal(
      success.admin.email,
      admin.email,
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      recoveries[0].revoked_at,
      null,
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
      challengeAfter.consumed_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      challengeAfter.invalidated_at,
      null,
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
        success.sessionToken,
      ),
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
  },
);
test(
  'noncanonical client IP is rejected before any recovery MFA database mutation',
  async () => {
    const now =
      new Date(
        '2026-08-30T01:30:00.000Z',
      );

    const canonicalClientIp =
      '203.0.113.160';

    const noncanonicalClientIp =
      ` ${canonicalClientIp} `;

    const admin =
      await insertAdmin({
        email:
          'recovery-client-ip@example.com',
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

    const recoveryCode =
      'L'.repeat(22);

    await insertRecoveryCode({
      adminId:
        admin.id,
      recoveryCode,
      now,
    });

    const canonicalKeys =
      mfaKeys(
        admin.id,
        canonicalClientIp,
      );

    const noncanonicalKeys =
      mfaKeys(
        admin.id,
        noncanonicalClientIp,
      );

    await assert.rejects(
      completeAdminRecoveryLogin({
        challengeToken,
        recoveryCode,
        clientIp:
          noncanonicalClientIp,
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
      challengeAfter.invalidated_at,
      null,
    );

    const recoveries =
      await recoveryRows(
        admin.id,
      );

    assert.equal(
      recoveries.length,
      1,
    );

    assert.equal(
      recoveries[0].used_at,
      null,
    );

    assert.equal(
      recoveries[0].revoked_at,
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
        await adminState(
          admin.id,
        )
      ).last_login_at,
      null,
    );

    assert.equal(
      await throttleState(
        'mfa_account',
        canonicalKeys.account,
      ),
      null,
    );

    assert.equal(
      await throttleState(
        'mfa_ip',
        canonicalKeys.ip,
      ),
      null,
    );

    assert.equal(
      await throttleState(
        'mfa_account',
        noncanonicalKeys.account,
      ),
      null,
    );

    assert.equal(
      await throttleState(
        'mfa_ip',
        noncanonicalKeys.ip,
      ),
      null,
    );
  },
);
