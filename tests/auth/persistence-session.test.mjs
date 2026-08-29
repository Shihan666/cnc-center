import assert from 'node:assert/strict';

import {
  after,
  before,
  test,
} from 'node:test';

import postgres from 'postgres';

const testDatabaseUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

const testMigrationUrl =
  process.env
    .TEST_DATABASE_MIGRATION_URL
    ?.trim();

const originalDatabaseUrl =
  process.env
    .DATABASE_URL;

const originalMigrationUrl =
  process.env
    .DATABASE_MIGRATION_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for persistence tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for persistence tests.',
  );
}

if (
  originalDatabaseUrl?.trim() ===
  testDatabaseUrl
) {
  throw new Error(
    'TEST_DATABASE_URL must not equal DATABASE_URL.',
  );
}

if (
  originalMigrationUrl?.trim() ===
  testMigrationUrl
) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL must not equal DATABASE_MIGRATION_URL.',
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

const {
  closeDatabase,
} = await import(
  '../../src/server/db/client.ts'
);

const {
  runAuthTransaction,
} = await import(
  '../../src/server/auth/persistence.ts'
);

const {
  createAdminSessionTiming,
  createTouchedIdleExpiry,
} = await import(
  '../../src/server/auth/service-foundation.ts'
);

const adminSql =
  postgres(
    testMigrationUrl,
    {
      max: 1,
    },
  );

const runtimeProbe =
  postgres(
    testDatabaseUrl,
    {
      max: 1,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const ADMIN_CREATED_AT =
  new Date(
    '2026-08-29T15:00:00.000Z',
  );

const BASE_TIME =
  new Date(
    '2026-08-29T16:00:00.000Z',
  );

const TEST_PASSWORD_HASH =
  'session-persistence-test-password-hash';

const TEST_ADMINS = {
  insertLookup: {
    id:
      '00000000-0000-4000-8000-000000006b01',
    email:
      'session-insert@example.test',
    isActive:
      true,
  },

  recovery: {
    id:
      '00000000-0000-4000-8000-000000006b02',
    email:
      'session-recovery@example.test',
    isActive:
      true,
  },

  touch: {
    id:
      '00000000-0000-4000-8000-000000006b03',
    email:
      'session-touch@example.test',
    isActive:
      true,
  },

  revoke: {
    id:
      '00000000-0000-4000-8000-000000006b04',
    email:
      'session-revoke@example.test',
    isActive:
      true,
  },

  bulk: {
    id:
      '00000000-0000-4000-8000-000000006b05',
    email:
      'session-bulk@example.test',
    isActive:
      true,
  },

  bulkOther: {
    id:
      '00000000-0000-4000-8000-000000006b06',
    email:
      'session-bulk-other@example.test',
    isActive:
      true,
  },

  lastLogin: {
    id:
      '00000000-0000-4000-8000-000000006b07',
    email:
      'session-last-login@example.test',
    isActive:
      true,
  },

  disabled: {
    id:
      '00000000-0000-4000-8000-000000006b08',
    email:
      'session-disabled@example.test',
    isActive:
      false,
  },

  concurrency: {
    id:
      '00000000-0000-4000-8000-000000006b09',
    email:
      'session-concurrency@example.test',
    isActive:
      true,
  },
};

const TEST_TOKEN_HASHES = {
  insertLookup:
    '71'.repeat(32),

  recovery:
    '72'.repeat(32),

  touch:
    '73'.repeat(32),

  revoke:
    '74'.repeat(32),

  bulkAlreadyRevoked:
    '75'.repeat(32),

  bulkActive:
    '76'.repeat(32),

  bulkOther:
    '77'.repeat(32),

  concurrency:
    '78'.repeat(32),
};

function cloneDate(
  value,
) {
  return new Date(
    value.getTime(),
  );
}

function addMilliseconds(
  value,
  milliseconds,
) {
  return new Date(
    value.getTime() +
      milliseconds,
  );
}

function createSessionInput(
  admin,
  tokenHash,
  options = {},
) {
  const now =
    options.now ??
    cloneDate(
      BASE_TIME,
    );

  return {
    adminId:
      admin.id,

    tokenHash,

    authMethod:
      options.authMethod ??
      'totp',

    timing:
      createAdminSessionTiming(
        now,
      ),
  };
}

async function insertSession(
  input,
) {
  return runAuthTransaction(
    (tx) =>
      tx.insertAdminSession(
        input,
      ),
  );
}

async function lockSession(
  tokenHash,
) {
  return runAuthTransaction(
    (tx) =>
      tx.lockAdminSessionByTokenHash(
        tokenHash,
      ),
  );
}

async function readDatabaseName(
  sql,
) {
  const rows =
    await sql`
      select
        current_database()
          as database_name
    `;

  return rows[0]
    ?.database_name;
}

async function readAuthTableCounts() {
  const rows =
    await adminSql`
      select
        'admin_auth_throttles'
          as table_name,
        count(*)::int
          as row_count
      from admin_auth_throttles

      union all

      select
        'admin_login_challenges',
        count(*)::int
      from admin_login_challenges

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
        'admin_totp_factors',
        count(*)::int
      from admin_totp_factors

      union all

      select
        'admins',
        count(*)::int
      from admins

      order by table_name
    `;

  return rows.map(
    (row) => ({
      tableName:
        row.table_name,

      rowCount:
        Number(
          row.row_count,
        ),
    }),
  );
}

function assertAuthTablesEmpty(
  rows,
  label,
) {
  assert.equal(
    rows.length,
    6,
    `${label}: expected six auth tables.`,
  );

  for (const row of rows) {
    assert.equal(
      row.rowCount,
      0,
      `${label}: expected ${row.tableName} to be empty.`,
    );
  }
}

async function insertSuiteAdmins() {
  for (
    const admin of
    Object.values(
      TEST_ADMINS,
    )
  ) {
    await adminSql`
      insert into admins (
        id,
        email,
        password_hash,
        is_active,
        password_changed_at,
        created_at,
        updated_at
      )
      values (
        ${admin.id},
        ${admin.email},
        ${TEST_PASSWORD_HASH},
        ${admin.isActive},
        ${ADMIN_CREATED_AT},
        ${ADMIN_CREATED_AT},
        ${ADMIN_CREATED_AT}
      )
    `;
  }
}

async function cleanupSuiteRows() {
  for (
    const admin of
    Object.values(
      TEST_ADMINS,
    )
  ) {
    await adminSql`
      delete
      from admin_sessions
      where admin_id = ${admin.id}
    `;

    await adminSql`
      delete
      from admins
      where id = ${admin.id}
    `;
  }
}

before(
  async () => {
    const adminDatabaseName =
      await readDatabaseName(
        adminSql,
      );

    const runtimeDatabaseName =
      await readDatabaseName(
        runtimeProbe,
      );

    assert.equal(
      adminDatabaseName,
      EXPECTED_TEST_DATABASE,
      'Migration-role test connection must target cnc_center_test.',
    );

    assert.equal(
      runtimeDatabaseName,
      EXPECTED_TEST_DATABASE,
      'Runtime-role test connection must target cnc_center_test.',
    );

    const counts =
      await readAuthTableCounts();

    assertAuthTablesEmpty(
      counts,
      'Pre-test auth baseline',
    );

    await insertSuiteAdmins();
  },
);

after(
  async () => {
    try {
      await closeDatabase();

      await cleanupSuiteRows();

      const counts =
        await readAuthTableCounts();

      assertAuthTablesEmpty(
        counts,
        'Post-test auth baseline',
      );
    } finally {
      await closeDatabase();

      await runtimeProbe.end({
        timeout: 5,
      });

      await adminSql.end({
        timeout: 5,
      });

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
    }
  },
);

test(
  'session insert and locked token-hash lookup preserve canonical persisted state',
  async () => {
    const input =
      createSessionInput(
        TEST_ADMINS.insertLookup,
        TEST_TOKEN_HASHES
          .insertLookup,
      );

    const inserted =
      await insertSession(
        input,
      );

    assert.equal(
      inserted.adminId,
      input.adminId,
    );

    assert.equal(
      inserted.authMethod,
      'totp',
    );

    assert.deepEqual(
      inserted.createdAt,
      input.timing.createdAt,
    );

    assert.deepEqual(
      inserted.lastSeenAt,
      input.timing.lastSeenAt,
    );

    assert.deepEqual(
      inserted.idleExpiresAt,
      input.timing.idleExpiresAt,
    );

    assert.deepEqual(
      inserted.absoluteExpiresAt,
      input.timing.absoluteExpiresAt,
    );

    assert.equal(
      inserted.revokedAt,
      null,
    );

    assert.equal(
      inserted.revocationReason,
      null,
    );

    const locked =
      await lockSession(
        input.tokenHash,
      );

    assert.ok(
      locked,
    );

    assert.deepEqual(
      locked,
      inserted,
    );
  },
);

test(
  'recovery-authenticated session persists its authentication method',
  async () => {
    const input =
      createSessionInput(
        TEST_ADMINS.recovery,
        TEST_TOKEN_HASHES.recovery,
        {
          authMethod:
            'recovery',
        },
      );

    const inserted =
      await insertSession(
        input,
      );

    assert.equal(
      inserted.authMethod,
      'recovery',
    );

    const locked =
      await lockSession(
        input.tokenHash,
      );

    assert.ok(
      locked,
    );

    assert.equal(
      locked.authMethod,
      'recovery',
    );
  },
);

test(
  'session touch updates last-seen and idle expiry while stale touch fails closed',
  async () => {
    const input =
      createSessionInput(
        TEST_ADMINS.touch,
        TEST_TOKEN_HASHES.touch,
      );

    const inserted =
      await insertSession(
        input,
      );

    const touchedAt =
      addMilliseconds(
        inserted.lastSeenAt,
        5 * 60 * 1_000,
      );

    const touchedIdleExpiresAt =
      createTouchedIdleExpiry(
        touchedAt,
        inserted.absoluteExpiresAt,
      );

    const firstTouch =
      await runAuthTransaction(
        (tx) =>
          tx.touchAdminSession(
            inserted.id,
            inserted.lastSeenAt,
            touchedAt,
            touchedIdleExpiresAt,
          ),
      );

    assert.equal(
      firstTouch,
      true,
    );

    const staleTouch =
      await runAuthTransaction(
        (tx) =>
          tx.touchAdminSession(
            inserted.id,
            inserted.lastSeenAt,
            addMilliseconds(
              touchedAt,
              1_000,
            ),
            createTouchedIdleExpiry(
              addMilliseconds(
                touchedAt,
                1_000,
              ),
              inserted.absoluteExpiresAt,
            ),
          ),
      );

    assert.equal(
      staleTouch,
      false,
    );

    const record =
      await lockSession(
        input.tokenHash,
      );

    assert.ok(
      record,
    );

    assert.deepEqual(
      record.lastSeenAt,
      touchedAt,
    );

    assert.deepEqual(
      record.idleExpiresAt,
      touchedIdleExpiresAt,
    );

    assert.equal(
      record.revokedAt,
      null,
    );
  },
);

test(
  'single-session revocation is terminal and prevents later touch',
  async () => {
    const input =
      createSessionInput(
        TEST_ADMINS.revoke,
        TEST_TOKEN_HASHES.revoke,
      );

    const inserted =
      await insertSession(
        input,
      );

    const revokedAt =
      addMilliseconds(
        BASE_TIME,
        10_000,
      );

    const firstRevoke =
      await runAuthTransaction(
        (tx) =>
          tx.revokeAdminSession(
            inserted.id,
            revokedAt,
            'logout',
          ),
      );

    const secondRevoke =
      await runAuthTransaction(
        (tx) =>
          tx.revokeAdminSession(
            inserted.id,
            addMilliseconds(
              revokedAt,
              1_000,
            ),
            'admin_disabled',
          ),
      );

    assert.equal(
      firstRevoke,
      true,
    );

    assert.equal(
      secondRevoke,
      false,
    );

    const touchAt =
      addMilliseconds(
        inserted.lastSeenAt,
        5 * 60 * 1_000,
      );

    const touched =
      await runAuthTransaction(
        (tx) =>
          tx.touchAdminSession(
            inserted.id,
            inserted.lastSeenAt,
            touchAt,
            createTouchedIdleExpiry(
              touchAt,
              inserted.absoluteExpiresAt,
            ),
          ),
      );

    assert.equal(
      touched,
      false,
    );

    const record =
      await lockSession(
        input.tokenHash,
      );

    assert.ok(
      record,
    );

    assert.deepEqual(
      record.revokedAt,
      revokedAt,
    );

    assert.equal(
      record.revocationReason,
      'logout',
    );
  },
);

test(
  'bulk revocation affects only active sessions for the target admin',
  async () => {
    const target =
      TEST_ADMINS.bulk;

    const other =
      TEST_ADMINS.bulkOther;

    const alreadyRevoked =
      await insertSession(
        createSessionInput(
          target,
          TEST_TOKEN_HASHES
            .bulkAlreadyRevoked,
        ),
      );

    const targetActive =
      await insertSession(
        createSessionInput(
          target,
          TEST_TOKEN_HASHES
            .bulkActive,
        ),
      );

    const otherActive =
      await insertSession(
        createSessionInput(
          other,
          TEST_TOKEN_HASHES
            .bulkOther,
        ),
      );

    const initialRevokedAt =
      addMilliseconds(
        BASE_TIME,
        20_000,
      );

    const initiallyRevoked =
      await runAuthTransaction(
        (tx) =>
          tx.revokeAdminSession(
            alreadyRevoked.id,
            initialRevokedAt,
            'logout',
          ),
      );

    assert.equal(
      initiallyRevoked,
      true,
    );

    const bulkRevokedAt =
      addMilliseconds(
        BASE_TIME,
        30_000,
      );

    const count =
      await runAuthTransaction(
        (tx) =>
          tx.revokeAllAdminSessions(
            target.id,
            bulkRevokedAt,
            'password_changed',
          ),
      );

    assert.equal(
      count,
      1,
    );

    const secondCount =
      await runAuthTransaction(
        (tx) =>
          tx.revokeAllAdminSessions(
            target.id,
            addMilliseconds(
              bulkRevokedAt,
              1_000,
            ),
            'mfa_reset',
          ),
      );

    assert.equal(
      secondCount,
      0,
    );

    const oldRecord =
      await lockSession(
        TEST_TOKEN_HASHES
          .bulkAlreadyRevoked,
      );

    const targetRecord =
      await lockSession(
        TEST_TOKEN_HASHES
          .bulkActive,
      );

    const otherRecord =
      await lockSession(
        TEST_TOKEN_HASHES
          .bulkOther,
      );

    assert.ok(
      oldRecord,
    );

    assert.ok(
      targetRecord,
    );

    assert.ok(
      otherRecord,
    );

    assert.deepEqual(
      oldRecord.revokedAt,
      initialRevokedAt,
    );

    assert.equal(
      oldRecord.revocationReason,
      'logout',
    );

    assert.deepEqual(
      targetRecord.revokedAt,
      bulkRevokedAt,
    );

    assert.equal(
      targetRecord.revocationReason,
      'password_changed',
    );

    assert.equal(
      otherRecord.id,
      otherActive.id,
    );

    assert.equal(
      otherRecord.revokedAt,
      null,
    );

    assert.equal(
      otherRecord.revocationReason,
      null,
    );

    assert.notEqual(
      targetActive.id,
      otherActive.id,
    );
  },
);

test(
  'last-login persistence updates active admin and fails closed for disabled admin',
  async () => {
    const active =
      TEST_ADMINS.lastLogin;

    const disabled =
      TEST_ADMINS.disabled;

    const lastLoginAt =
      addMilliseconds(
        BASE_TIME,
        40_000,
      );

    const activeUpdated =
      await runAuthTransaction(
        (tx) =>
          tx.setAdminLastLoginAt(
            active.id,
            lastLoginAt,
          ),
      );

    const disabledUpdated =
      await runAuthTransaction(
        (tx) =>
          tx.setAdminLastLoginAt(
            disabled.id,
            lastLoginAt,
          ),
      );

    assert.equal(
      activeUpdated,
      true,
    );

    assert.equal(
      disabledUpdated,
      false,
    );

    const rows =
      await adminSql`
        select
          id,
          last_login_at
        from admins
        where id in (
          ${active.id},
          ${disabled.id}
        )
        order by id
      `;

    assert.equal(
      rows.length,
      2,
    );

    const activeRow =
      rows.find(
        (row) =>
          row.id === active.id,
      );

    const disabledRow =
      rows.find(
        (row) =>
          row.id === disabled.id,
      );

    assert.ok(
      activeRow,
    );

    assert.ok(
      disabledRow,
    );

    assert.deepEqual(
      activeRow.last_login_at,
      lastLoginAt,
    );

    assert.equal(
      disabledRow.last_login_at,
      null,
    );
  },
);

test(
  'concurrent touches using the same expected last-seen value allow exactly one winner',
  async () => {
    const input =
      createSessionInput(
        TEST_ADMINS.concurrency,
        TEST_TOKEN_HASHES.concurrency,
      );

    const inserted =
      await insertSession(
        input,
      );

    const touchedAt =
      addMilliseconds(
        inserted.lastSeenAt,
        5 * 60 * 1_000,
      );

    const idleExpiresAt =
      createTouchedIdleExpiry(
        touchedAt,
        inserted.absoluteExpiresAt,
      );

    const results =
      await Promise.all([
        runAuthTransaction(
          (tx) =>
            tx.touchAdminSession(
              inserted.id,
              inserted.lastSeenAt,
              touchedAt,
              idleExpiresAt,
            ),
        ),

        runAuthTransaction(
          (tx) =>
            tx.touchAdminSession(
              inserted.id,
              inserted.lastSeenAt,
              touchedAt,
              idleExpiresAt,
            ),
        ),
      ]);

    assert.equal(
      results.filter(
        (value) =>
          value === true,
      ).length,
      1,
    );

    assert.equal(
      results.filter(
        (value) =>
          value === false,
      ).length,
      1,
    );

    const record =
      await lockSession(
        input.tokenHash,
      );

    assert.ok(
      record,
    );

    assert.deepEqual(
      record.lastSeenAt,
      touchedAt,
    );

    assert.deepEqual(
      record.idleExpiresAt,
      idleExpiresAt,
    );
  },
);

test(
  'session persistence rejects noncanonical token hashes and invalid revocation reasons',
  async () => {
    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.lockAdminSessionByTokenHash(
            'NOT-A-CANONICAL-HASH',
          ),
      ),
      /lowercase SHA-256 hex hash/,
    );

    const session =
      await lockSession(
        TEST_TOKEN_HASHES
          .insertLookup,
      );

    assert.ok(
      session,
    );

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.revokeAdminSession(
            session.id,
            addMilliseconds(
              BASE_TIME,
              50_000,
            ),
            'not-a-valid-reason',
          ),
      ),
      /Invalid admin session revocation reason/,
    );
  },
);