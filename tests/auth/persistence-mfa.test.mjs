import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

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

const FACTOR_CREATED_AT =
  new Date(
    '2026-08-29T16:00:00.000Z',
  );

const FACTOR_CONFIRMED_AT =
  new Date(
    '2026-08-29T16:05:00.000Z',
  );

const BASE_TIME =
  new Date(
    '2026-08-29T17:00:00.000Z',
  );

const TEST_PASSWORD_HASH =
  'mfa-persistence-test-password-hash';

const TEST_ADMINS = {
  totpLock: {
    id:
      '00000000-0000-4000-8000-000000007b01',
    email:
      'mfa-totp-lock@example.test',
  },

  unconfirmedLock: {
    id:
      '00000000-0000-4000-8000-000000007b02',
    email:
      'mfa-unconfirmed-lock@example.test',
  },

  nullCounter: {
    id:
      '00000000-0000-4000-8000-000000007b03',
    email:
      'mfa-null-counter@example.test',
  },

  existingCounter: {
    id:
      '00000000-0000-4000-8000-000000007b04',
    email:
      'mfa-existing-counter@example.test',
  },

  unconfirmedAdvance: {
    id:
      '00000000-0000-4000-8000-000000007b05',
    email:
      'mfa-unconfirmed-advance@example.test',
  },

  concurrentTotp: {
    id:
      '00000000-0000-4000-8000-000000007b06',
    email:
      'mfa-concurrent-totp@example.test',
  },

  recoveryLookup: {
    id:
      '00000000-0000-4000-8000-000000007b07',
    email:
      'mfa-recovery-lookup@example.test',
  },

  recoveryConsume: {
    id:
      '00000000-0000-4000-8000-000000007b08',
    email:
      'mfa-recovery-consume@example.test',
  },

  recoveryConcurrent: {
    id:
      '00000000-0000-4000-8000-000000007b09',
    email:
      'mfa-recovery-concurrent@example.test',
  },
};

const TOTP_FACTOR_IDS = {
  lock:
    '00000000-0000-4000-8000-000000007c01',

  unconfirmedLock:
    '00000000-0000-4000-8000-000000007c02',

  nullCounter:
    '00000000-0000-4000-8000-000000007c03',

  existingCounter:
    '00000000-0000-4000-8000-000000007c04',

  unconfirmedAdvance:
    '00000000-0000-4000-8000-000000007c05',

  concurrent:
    '00000000-0000-4000-8000-000000007c06',
};

const RECOVERY_CODE_IDS = {
  activeLookup:
    '00000000-0000-4000-8000-000000007d01',

  usedLookup:
    '00000000-0000-4000-8000-000000007d02',

  revokedLookup:
    '00000000-0000-4000-8000-000000007d03',

  consume:
    '00000000-0000-4000-8000-000000007d04',

  concurrent:
    '00000000-0000-4000-8000-000000007d05',
};

const RECOVERY_HASHES = {
  active:
    '91'.repeat(32),

  used:
    '92'.repeat(32),

  revoked:
    '93'.repeat(32),

  consume:
    '94'.repeat(32),

  concurrent:
    '95'.repeat(32),
};

const SECRET_CIPHERTEXT =
  Buffer.from([
    11,
    22,
    33,
    44,
    55,
  ]);

const SECRET_NONCE =
  Buffer.from([
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
  ]);

const SECRET_AUTH_TAG =
  Buffer.from([
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    34,
    35,
    36,
  ]);

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
        true,
        ${ADMIN_CREATED_AT},
        ${ADMIN_CREATED_AT},
        ${ADMIN_CREATED_AT}
      )
    `;
  }
}

async function insertTotpFactor(
  {
    id,
    adminId,
    confirmedAt =
      FACTOR_CONFIRMED_AT,
    lastUsedCounter = null,
    secretCiphertext =
      SECRET_CIPHERTEXT,
    secretNonce =
      SECRET_NONCE,
    secretAuthTag =
      SECRET_AUTH_TAG,
    keyVersion = 1,
  },
) {
  await adminSql`
    insert into admin_totp_factors (
      id,
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
      ${id},
      ${adminId},
      ${secretCiphertext},
      ${secretNonce},
      ${secretAuthTag},
      ${keyVersion},
      ${lastUsedCounter},
      ${confirmedAt},
      ${FACTOR_CREATED_AT},
      ${FACTOR_CREATED_AT}
    )
  `;
}

async function insertRecoveryCode(
  {
    id,
    adminId,
    codeHash,
    usedAt = null,
    revokedAt = null,
  },
) {
  await adminSql`
    insert into admin_recovery_codes (
      id,
      admin_id,
      code_hash,
      created_at,
      used_at,
      revoked_at
    )
    values (
      ${id},
      ${adminId},
      ${codeHash},
      ${FACTOR_CREATED_AT},
      ${usedAt},
      ${revokedAt}
    )
  `;
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
      from admin_recovery_codes
      where admin_id = ${admin.id}
    `;

    await adminSql`
      delete
      from admin_totp_factors
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
      'Migration-role connection must target cnc_center_test.',
    );

    assert.equal(
      runtimeDatabaseName,
      EXPECTED_TEST_DATABASE,
      'Runtime-role connection must target cnc_center_test.',
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
  'TOTP factor lock returns canonical encrypted persisted state',
  async () => {
    await insertTotpFactor({
      id:
        TOTP_FACTOR_IDS.lock,

      adminId:
        TEST_ADMINS.totpLock.id,
    });

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminTotpFactorByAdminId(
            TEST_ADMINS
              .totpLock
              .id,
          ),
      );

    assert.ok(
      record,
    );

    assert.equal(
      record.id,
      TOTP_FACTOR_IDS.lock,
    );

    assert.equal(
      record.adminId,
      TEST_ADMINS.totpLock.id,
    );

    assert.deepEqual(
      Array.from(
        record.secretCiphertext,
      ),
      Array.from(
        SECRET_CIPHERTEXT,
      ),
    );

    assert.deepEqual(
      Array.from(
        record.secretNonce,
      ),
      Array.from(
        SECRET_NONCE,
      ),
    );

    assert.deepEqual(
      Array.from(
        record.secretAuthTag,
      ),
      Array.from(
        SECRET_AUTH_TAG,
      ),
    );

    assert.equal(
      record.keyVersion,
      1,
    );

    assert.equal(
      record.lastUsedCounter,
      null,
    );

    assert.deepEqual(
      record.confirmedAt,
      FACTOR_CONFIRMED_AT,
    );

    assert.deepEqual(
      record.createdAt,
      FACTOR_CREATED_AT,
    );

    assert.deepEqual(
      record.updatedAt,
      FACTOR_CREATED_AT,
    );
  },
);

test(
  'unconfirmed TOTP factor is lockable and missing factor returns null',
  async () => {
    await insertTotpFactor({
      id:
        TOTP_FACTOR_IDS
          .unconfirmedLock,

      adminId:
        TEST_ADMINS
          .unconfirmedLock
          .id,

      confirmedAt:
        null,
    });

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminTotpFactorByAdminId(
            TEST_ADMINS
              .unconfirmedLock
              .id,
          ),
      );

    assert.ok(
      record,
    );

    assert.equal(
      record.confirmedAt,
      null,
    );

    const missing =
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminTotpFactorByAdminId(
            '00000000-0000-4000-8000-ffffffffffff',
          ),
      );

    assert.equal(
      missing,
      null,
    );
  },
);

test(
  'confirmed TOTP counter advances from null exactly once for the expected state',
  async () => {
    await insertTotpFactor({
      id:
        TOTP_FACTOR_IDS.nullCounter,

      adminId:
        TEST_ADMINS.nullCounter.id,

      lastUsedCounter:
        null,
    });

    const updatedAt =
      cloneDate(
        BASE_TIME,
      );

    const first =
      await runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS.nullCounter,
            null,
            100,
            updatedAt,
          ),
      );

    const stale =
      await runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS.nullCounter,
            null,
            101,
            addMilliseconds(
              updatedAt,
              1_000,
            ),
          ),
      );

    assert.equal(
      first,
      true,
    );

    assert.equal(
      stale,
      false,
    );

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminTotpFactorByAdminId(
            TEST_ADMINS.nullCounter.id,
          ),
      );

    assert.ok(
      record,
    );

    assert.equal(
      record.lastUsedCounter,
      100,
    );

    assert.deepEqual(
      record.updatedAt,
      updatedAt,
    );
  },
);

test(
  'confirmed TOTP counter uses exact non-null optimistic guard and rejects stale replay',
  async () => {
    await insertTotpFactor({
      id:
        TOTP_FACTOR_IDS
          .existingCounter,

      adminId:
        TEST_ADMINS
          .existingCounter
          .id,

      lastUsedCounter:
        200,
    });

    const updatedAt =
      addMilliseconds(
        BASE_TIME,
        10_000,
      );

    const first =
      await runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS
              .existingCounter,
            200,
            201,
            updatedAt,
          ),
      );

    const stale =
      await runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS
              .existingCounter,
            200,
            202,
            addMilliseconds(
              updatedAt,
              1_000,
            ),
          ),
      );

    assert.equal(
      first,
      true,
    );

    assert.equal(
      stale,
      false,
    );

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminTotpFactorByAdminId(
            TEST_ADMINS
              .existingCounter
              .id,
          ),
      );

    assert.ok(
      record,
    );

    assert.equal(
      record.lastUsedCounter,
      201,
    );
  },
);

test(
  'unconfirmed TOTP cannot advance and invalid counter transitions fail closed',
  async () => {
    await insertTotpFactor({
      id:
        TOTP_FACTOR_IDS
          .unconfirmedAdvance,

      adminId:
        TEST_ADMINS
          .unconfirmedAdvance
          .id,

      confirmedAt:
        null,

      lastUsedCounter:
        null,
    });

    const unconfirmed =
      await runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS
              .unconfirmedAdvance,
            null,
            1,
            BASE_TIME,
          ),
      );

    assert.equal(
      unconfirmed,
      false,
    );

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS
              .unconfirmedAdvance,
            null,
            -1,
            BASE_TIME,
          ),
      ),
      /non-negative safe integer/,
    );

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS
              .unconfirmedAdvance,
            10,
            10,
            BASE_TIME,
          ),
      ),
      /must exceed/,
    );

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.advanceConfirmedAdminTotpCounter(
            TOTP_FACTOR_IDS
              .unconfirmedAdvance,
            10,
            9,
            BASE_TIME,
          ),
      ),
      /must exceed/,
    );
  },
);

test(
  'concurrent TOTP counter advances using the same expected state allow exactly one winner',
  async () => {
    await insertTotpFactor({
      id:
        TOTP_FACTOR_IDS.concurrent,

      adminId:
        TEST_ADMINS
          .concurrentTotp
          .id,

      lastUsedCounter:
        null,
    });

    const results =
      await Promise.all([
        runAuthTransaction(
          (tx) =>
            tx.advanceConfirmedAdminTotpCounter(
              TOTP_FACTOR_IDS.concurrent,
              null,
              300,
              BASE_TIME,
            ),
        ),

        runAuthTransaction(
          (tx) =>
            tx.advanceConfirmedAdminTotpCounter(
              TOTP_FACTOR_IDS.concurrent,
              null,
              300,
              BASE_TIME,
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
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminTotpFactorByAdminId(
            TEST_ADMINS
              .concurrentTotp
              .id,
          ),
      );

    assert.ok(
      record,
    );

    assert.equal(
      record.lastUsedCounter,
      300,
    );
  },
);

test(
  'active recovery-code lookup excludes used and revoked codes',
  async () => {
    const terminalAt =
      addMilliseconds(
        FACTOR_CREATED_AT,
        10_000,
      );

    await insertRecoveryCode({
      id:
        RECOVERY_CODE_IDS.activeLookup,

      adminId:
        TEST_ADMINS
          .recoveryLookup
          .id,

      codeHash:
        RECOVERY_HASHES.active,
    });

    await insertRecoveryCode({
      id:
        RECOVERY_CODE_IDS.usedLookup,

      adminId:
        TEST_ADMINS
          .recoveryLookup
          .id,

      codeHash:
        RECOVERY_HASHES.used,

      usedAt:
        terminalAt,
    });

    await insertRecoveryCode({
      id:
        RECOVERY_CODE_IDS.revokedLookup,

      adminId:
        TEST_ADMINS
          .recoveryLookup
          .id,

      codeHash:
        RECOVERY_HASHES.revoked,

      revokedAt:
        terminalAt,
    });

    const active =
      await runAuthTransaction(
        (tx) =>
          tx.lockActiveRecoveryCodeByHash(
            RECOVERY_HASHES.active,
          ),
      );

    const used =
      await runAuthTransaction(
        (tx) =>
          tx.lockActiveRecoveryCodeByHash(
            RECOVERY_HASHES.used,
          ),
      );

    const revoked =
      await runAuthTransaction(
        (tx) =>
          tx.lockActiveRecoveryCodeByHash(
            RECOVERY_HASHES.revoked,
          ),
      );

    assert.ok(
      active,
    );

    assert.equal(
      active.id,
      RECOVERY_CODE_IDS.activeLookup,
    );

    assert.equal(
      active.adminId,
      TEST_ADMINS
        .recoveryLookup
        .id,
    );

    assert.equal(
      active.codeHash,
      RECOVERY_HASHES.active,
    );

    assert.equal(
      active.usedAt,
      null,
    );

    assert.equal(
      active.revokedAt,
      null,
    );

    assert.equal(
      used,
      null,
    );

    assert.equal(
      revoked,
      null,
    );
  },
);

test(
  'recovery-code consumption is atomic and terminal',
  async () => {
    await insertRecoveryCode({
      id:
        RECOVERY_CODE_IDS.consume,

      adminId:
        TEST_ADMINS
          .recoveryConsume
          .id,

      codeHash:
        RECOVERY_HASHES.consume,
    });

    const usedAt =
      addMilliseconds(
        BASE_TIME,
        20_000,
      );

    const first =
      await runAuthTransaction(
        (tx) =>
          tx.consumeRecoveryCode(
            RECOVERY_CODE_IDS.consume,
            usedAt,
          ),
      );

    const second =
      await runAuthTransaction(
        (tx) =>
          tx.consumeRecoveryCode(
            RECOVERY_CODE_IDS.consume,
            addMilliseconds(
              usedAt,
              1_000,
            ),
          ),
      );

    assert.equal(
      first,
      true,
    );

    assert.equal(
      second,
      false,
    );

    const activeLookup =
      await runAuthTransaction(
        (tx) =>
          tx.lockActiveRecoveryCodeByHash(
            RECOVERY_HASHES.consume,
          ),
      );

    assert.equal(
      activeLookup,
      null,
    );

    const rows =
      await adminSql`
        select
          used_at,
          revoked_at
        from admin_recovery_codes
        where id =
          ${RECOVERY_CODE_IDS.consume}
    `;

    assert.equal(
      rows.length,
      1,
    );

    assert.deepEqual(
      rows[0].used_at,
      usedAt,
    );

    assert.equal(
      rows[0].revoked_at,
      null,
    );
  },
);

test(
  'concurrent recovery-code consumption allows exactly one winner',
  async () => {
    await insertRecoveryCode({
      id:
        RECOVERY_CODE_IDS.concurrent,

      adminId:
        TEST_ADMINS
          .recoveryConcurrent
          .id,

      codeHash:
        RECOVERY_HASHES.concurrent,
    });

    const usedAt =
      addMilliseconds(
        BASE_TIME,
        30_000,
      );

    const results =
      await Promise.all([
        runAuthTransaction(
          (tx) =>
            tx.consumeRecoveryCode(
              RECOVERY_CODE_IDS.concurrent,
              usedAt,
            ),
        ),

        runAuthTransaction(
          (tx) =>
            tx.consumeRecoveryCode(
              RECOVERY_CODE_IDS.concurrent,
              usedAt,
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
  },
);

test(
  'recovery-code hash validation rejects noncanonical hashes',
  async () => {
    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.lockActiveRecoveryCodeByHash(
            'NOT-A-CANONICAL-HASH',
          ),
      ),
      /lowercase SHA-256 hex hash/,
    );
  },
);

test(
  'database constraints reject malformed persisted TOTP cryptographic state',
  async () => {
    await assert.rejects(
      insertTotpFactor({
        id:
          '00000000-0000-4000-8000-000000007cff',

        adminId:
          TEST_ADMINS
            .recoveryConcurrent
            .id,

        secretNonce:
          Buffer.from([
            1,
            2,
            3,
          ]),
      }),
      /admin_totp_factors_nonce_length/,
    );
  },
);