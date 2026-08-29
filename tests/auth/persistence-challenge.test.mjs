import assert from 'node:assert/strict';

import {
  after,
  before,
  test,
} from 'node:test';

import postgres from 'postgres';

import {
  ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS,
} from '../../src/server/auth/service-contract.ts';

import {
  transitionLoginChallengeFailure,
} from '../../src/server/auth/service-foundation.ts';

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

const BASE_TIME =
  new Date(
    '2026-08-29T16:00:00.000Z',
  );

const TEST_PASSWORD_HASH =
  'challenge-persistence-test-password-hash';

const TEST_ADMINS = {
  lock: {
    id:
      '00000000-0000-4000-8000-000000005b01',
    email:
      'challenge-lock@example.test',
  },

  insertLookup: {
    id:
      '00000000-0000-4000-8000-000000005b02',
    email:
      'challenge-insert@example.test',
  },

  replace: {
    id:
      '00000000-0000-4000-8000-000000005b03',
    email:
      'challenge-replace@example.test',
  },

  failure: {
    id:
      '00000000-0000-4000-8000-000000005b04',
    email:
      'challenge-failure@example.test',
  },

  stale: {
    id:
      '00000000-0000-4000-8000-000000005b05',
    email:
      'challenge-stale@example.test',
  },

  consume: {
    id:
      '00000000-0000-4000-8000-000000005b06',
    email:
      'challenge-consume@example.test',
  },

  concurrency: {
    id:
      '00000000-0000-4000-8000-000000005b07',
    email:
      'challenge-concurrency@example.test',
  },
};

const TEST_TOKEN_HASHES = {
  insertLookup:
    '61'.repeat(32),

  replaceInitial:
    '62'.repeat(32),

  replaceNext:
    '63'.repeat(32),

  failure:
    '64'.repeat(32),

  stale:
    '65'.repeat(32),

  consume:
    '66'.repeat(32),

  concurrencyA:
    '67'.repeat(32),

  concurrencyB:
    '68'.repeat(32),
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

function createChallengeInput(
  admin,
  tokenHash,
  options = {},
) {
  const createdAt =
    options.createdAt ??
    cloneDate(
      BASE_TIME,
    );

  return {
    adminId:
      admin.id,

    tokenHash,

    type:
      options.type ??
      'mfa',

    createdAt,

    expiresAt:
      options.expiresAt ??
      addMilliseconds(
        createdAt,
        5 * 60 * 1_000,
      ),
  };
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

async function cleanupSuiteRows() {
  for (
    const admin of
    Object.values(
      TEST_ADMINS,
    )
  ) {
    await adminSql`
      delete
      from admin_login_challenges
      where admin_id = ${admin.id}
    `;

    await adminSql`
      delete
      from admins
      where id = ${admin.id}
    `;
  }
}

async function insertChallenge(
  input,
) {
  return runAuthTransaction(
    (tx) =>
      tx.insertLoginChallenge(
        input,
      ),
  );
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
  'admin auth locking returns the persisted admin state',
  async () => {
    const admin =
      TEST_ADMINS.lock;

    const locked =
      await runAuthTransaction(
        (tx) =>
          tx.lockAdminForAuth(
            admin.id,
          ),
      );

    assert.ok(
      locked,
    );

    assert.equal(
      locked.id,
      admin.id,
    );

    assert.equal(
      locked.email,
      admin.email,
    );

    assert.equal(
      locked.passwordHash,
      TEST_PASSWORD_HASH,
    );

    assert.equal(
      locked.isActive,
      true,
    );

    assert.deepEqual(
      locked.passwordChangedAt,
      ADMIN_CREATED_AT,
    );

    assert.equal(
      locked.lastLoginAt,
      null,
    );
  },
);

test(
  'challenge insert and locked token-hash lookup preserve the canonical record',
  async () => {
    const input =
      createChallengeInput(
        TEST_ADMINS.insertLookup,
        TEST_TOKEN_HASHES.insertLookup,
        {
          type:
            'enrollment',
        },
      );

    const inserted =
      await insertChallenge(
        input,
      );

    assert.equal(
      inserted.adminId,
      input.adminId,
    );

    assert.equal(
      inserted.tokenHash,
      input.tokenHash,
    );

    assert.equal(
      inserted.type,
      'enrollment',
    );

    assert.equal(
      inserted.attemptCount,
      0,
    );

    assert.deepEqual(
      inserted.createdAt,
      input.createdAt,
    );

    assert.deepEqual(
      inserted.expiresAt,
      input.expiresAt,
    );

    assert.equal(
      inserted.consumedAt,
      null,
    );

    assert.equal(
      inserted.invalidatedAt,
      null,
    );

    const locked =
      await runAuthTransaction(
        (tx) =>
          tx.lockLoginChallengeByTokenHash(
            input.tokenHash,
          ),
      );

    assert.ok(
      locked,
    );

    assert.equal(
      locked.id,
      inserted.id,
    );

    assert.deepEqual(
      locked,
      inserted,
    );

    const consumed =
      await runAuthTransaction(
        (tx) =>
          tx.consumeLoginChallenge(
            inserted.id,
            addMilliseconds(
              BASE_TIME,
              1_000,
            ),
          ),
      );

    assert.equal(
      consumed,
      true,
    );
  },
);

test(
  'active challenge is invalidated before its replacement is inserted',
  async () => {
    const admin =
      TEST_ADMINS.replace;

    const initial =
      await insertChallenge(
        createChallengeInput(
          admin,
          TEST_TOKEN_HASHES
            .replaceInitial,
        ),
      );

    const invalidatedAt =
      addMilliseconds(
        BASE_TIME,
        10_000,
      );

    const replacement =
      await runAuthTransaction(
        async (tx) => {
          const lockedAdmin =
            await tx
              .lockAdminForAuth(
                admin.id,
              );

          assert.ok(
            lockedAdmin,
          );

          await tx
            .invalidateActiveLoginChallenge(
              admin.id,
              invalidatedAt,
            );

          return tx
            .insertLoginChallenge(
              createChallengeInput(
                admin,
                TEST_TOKEN_HASHES
                  .replaceNext,
                {
                  createdAt:
                    invalidatedAt,
                },
              ),
            );
        },
      );

    const oldRecord =
      await runAuthTransaction(
        (tx) =>
          tx.lockLoginChallengeByTokenHash(
            initial.tokenHash,
          ),
      );

    const newRecord =
      await runAuthTransaction(
        (tx) =>
          tx.lockLoginChallengeByTokenHash(
            replacement.tokenHash,
          ),
      );

    assert.ok(
      oldRecord,
    );

    assert.ok(
      newRecord,
    );

    assert.deepEqual(
      oldRecord.invalidatedAt,
      invalidatedAt,
    );

    assert.equal(
      oldRecord.consumedAt,
      null,
    );

    assert.equal(
      newRecord.invalidatedAt,
      null,
    );

    const consumed =
      await runAuthTransaction(
        (tx) =>
          tx.consumeLoginChallenge(
            replacement.id,
            addMilliseconds(
              invalidatedAt,
              1_000,
            ),
          ),
      );

    assert.equal(
      consumed,
      true,
    );
  },
);

test(
  'challenge failure transitions persist atomically and invalidate on the fifth failure',
  async () => {
    const input =
      createChallengeInput(
        TEST_ADMINS.failure,
        TEST_TOKEN_HASHES.failure,
      );

    const inserted =
      await insertChallenge(
        input,
      );

    for (
      let index = 0;
      index <
        ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS;
      index += 1
    ) {
      const failureTime =
        addMilliseconds(
          BASE_TIME,
          index * 1_000,
        );

      const applied =
        await runAuthTransaction(
          async (tx) => {
            const locked =
              await tx
                .lockLoginChallengeByTokenHash(
                  input.tokenHash,
                );

            assert.ok(
              locked,
            );

            const transition =
              transitionLoginChallengeFailure(
                locked.attemptCount,
                failureTime,
              );

            return tx
              .applyLoginChallengeFailure(
                locked.id,
                transition,
              );
          },
        );

      assert.equal(
        applied,
        true,
      );
    }

    const finalRecord =
      await runAuthTransaction(
        (tx) =>
          tx.lockLoginChallengeByTokenHash(
            inserted.tokenHash,
          ),
      );

    assert.ok(
      finalRecord,
    );

    assert.equal(
      finalRecord.attemptCount,
      ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS,
    );

    assert.deepEqual(
      finalRecord.invalidatedAt,
      addMilliseconds(
        BASE_TIME,
        (
          ADMIN_LOGIN_CHALLENGE_MAX_ATTEMPTS -
          1
        ) * 1_000,
      ),
    );

    assert.equal(
      finalRecord.consumedAt,
      null,
    );
  },
);

test(
  'stale challenge failure transition fails closed instead of overwriting newer state',
  async () => {
    const input =
      createChallengeInput(
        TEST_ADMINS.stale,
        TEST_TOKEN_HASHES.stale,
      );

    const inserted =
      await insertChallenge(
        input,
      );

    const transition =
      transitionLoginChallengeFailure(
        0,
        BASE_TIME,
      );

    const firstApplied =
      await runAuthTransaction(
        (tx) =>
          tx.applyLoginChallengeFailure(
            inserted.id,
            transition,
          ),
      );

    const staleApplied =
      await runAuthTransaction(
        (tx) =>
          tx.applyLoginChallengeFailure(
            inserted.id,
            transition,
          ),
      );

    assert.equal(
      firstApplied,
      true,
    );

    assert.equal(
      staleApplied,
      false,
    );

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.lockLoginChallengeByTokenHash(
            input.tokenHash,
          ),
      );

    assert.ok(
      record,
    );

    assert.equal(
      record.attemptCount,
      1,
    );

    const consumed =
      await runAuthTransaction(
        (tx) =>
          tx.consumeLoginChallenge(
            inserted.id,
            addMilliseconds(
              BASE_TIME,
              2_000,
            ),
          ),
      );

    assert.equal(
      consumed,
      true,
    );
  },
);

test(
  'challenge consumption is one-time and terminal',
  async () => {
    const input =
      createChallengeInput(
        TEST_ADMINS.consume,
        TEST_TOKEN_HASHES.consume,
      );

    const inserted =
      await insertChallenge(
        input,
      );

    const consumedAt =
      addMilliseconds(
        BASE_TIME,
        5_000,
      );

    const first =
      await runAuthTransaction(
        (tx) =>
          tx.consumeLoginChallenge(
            inserted.id,
            consumedAt,
          ),
      );

    const second =
      await runAuthTransaction(
        (tx) =>
          tx.consumeLoginChallenge(
            inserted.id,
            addMilliseconds(
              consumedAt,
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

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.lockLoginChallengeByTokenHash(
            input.tokenHash,
          ),
      );

    assert.ok(
      record,
    );

    assert.deepEqual(
      record.consumedAt,
      consumedAt,
    );

    assert.equal(
      record.invalidatedAt,
      null,
    );

    const failureTransition =
      transitionLoginChallengeFailure(
        record.attemptCount,
        addMilliseconds(
          consumedAt,
          2_000,
        ),
      );

    const appliedAfterConsumption =
      await runAuthTransaction(
        (tx) =>
          tx.applyLoginChallengeFailure(
            inserted.id,
            failureTransition,
          ),
      );

    assert.equal(
      appliedAfterConsumption,
      false,
    );
  },
);

test(
  'concurrent replacement flows serialize on the admin lock and leave exactly one active challenge',
  async () => {
    const admin =
      TEST_ADMINS.concurrency;

    const replacementTime =
      addMilliseconds(
        BASE_TIME,
        30_000,
      );

    const replace =
      (tokenHash) =>
        runAuthTransaction(
          async (tx) => {
            const lockedAdmin =
              await tx
                .lockAdminForAuth(
                  admin.id,
                );

            assert.ok(
              lockedAdmin,
            );

            await tx
              .invalidateActiveLoginChallenge(
                admin.id,
                replacementTime,
              );

            return tx
              .insertLoginChallenge(
                createChallengeInput(
                  admin,
                  tokenHash,
                  {
                    createdAt:
                      replacementTime,
                  },
                ),
              );
          },
        );

    const results =
      await Promise.all([
        replace(
          TEST_TOKEN_HASHES
            .concurrencyA,
        ),

        replace(
          TEST_TOKEN_HASHES
            .concurrencyB,
        ),
      ]);

    assert.equal(
      results.length,
      2,
    );

    const rows =
      await adminSql`
        select
          token_hash,
          invalidated_at
        from admin_login_challenges
        where admin_id = ${admin.id}
        order by token_hash
      `;

    assert.equal(
      rows.length,
      2,
    );

    const activeRows =
      rows.filter(
        (row) =>
          row.invalidated_at ===
          null,
      );

    const invalidatedRows =
      rows.filter(
        (row) =>
          row.invalidated_at !==
          null,
      );

    assert.equal(
      activeRows.length,
      1,
    );

    assert.equal(
      invalidatedRows.length,
      1,
    );

    assert.ok(
      [
        TEST_TOKEN_HASHES
          .concurrencyA,
        TEST_TOKEN_HASHES
          .concurrencyB,
      ].includes(
        activeRows[0]
          .token_hash,
      ),
    );

    const activeTokenHash =
      activeRows[0]
        .token_hash;

    const activeRecord =
      results.find(
        (result) =>
          result.tokenHash ===
          activeTokenHash,
      );

    assert.ok(
      activeRecord,
    );

    const consumed =
      await runAuthTransaction(
        (tx) =>
          tx.consumeLoginChallenge(
            activeRecord.id,
            addMilliseconds(
              replacementTime,
              1_000,
            ),
          ),
      );

    assert.equal(
      consumed,
      true,
    );
  },
);