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

const originalDatabaseUrl =
  process.env.DATABASE_URL;

process.env.DATABASE_URL =
  testDatabaseUrl;

const {
  closeDatabase,
} = await import(
  '../../src/server/db/client.ts'
);

const {
  getAuthThrottleState,
  recordAuthThrottleFailure,
  resetAuthThrottle,
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

const BASE_TIME =
  new Date(
    '2026-08-29T16:00:00.000Z',
  );

const TEST_KEY_HASHES = {
  create:
    '11'.repeat(32),

  threshold:
    '22'.repeat(32),

  windowReset:
    '33'.repeat(32),

  explicitReset:
    '44'.repeat(32),

  concurrency:
    '55'.repeat(32),
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

async function cleanupSuiteThrottleRows() {
  for (
    const keyHash of
    Object.values(
      TEST_KEY_HASHES,
    )
  ) {
    await adminSql`
      delete
      from admin_auth_throttles
      where key_hash = ${keyHash}
    `;
  }
}

before(
  async () => {
    const counts =
      await readAuthTableCounts();

    assertAuthTablesEmpty(
      counts,
      'Pre-test auth baseline',
    );
  },
);

after(
  async () => {
    try {
      await cleanupSuiteThrottleRows();

      await closeDatabase();

      const counts =
        await readAuthTableCounts();

      assertAuthTablesEmpty(
        counts,
        'Post-test auth baseline',
      );
    } finally {
      await closeDatabase();

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
  'throttle lookup returns null before a row exists',
  async () => {
    const state =
      await getAuthThrottleState(
        'password_account',
        TEST_KEY_HASHES.create,
      );

    assert.equal(
      state,
      null,
    );
  },
);

test(
  'first throttle failure creates and persists the canonical state',
  async () => {
    const now =
      cloneDate(
        BASE_TIME,
      );

    const result =
      await recordAuthThrottleFailure(
        'password_account',
        TEST_KEY_HASHES.create,
        now,
      );

    assert.equal(
      result.blocked,
      false,
    );

    assert.equal(
      result.state.failureCount,
      1,
    );

    assert.deepEqual(
      result.state.windowStartedAt,
      now,
    );

    assert.equal(
      result.state.blockedUntil,
      null,
    );

    const persisted =
      await getAuthThrottleState(
        'password_account',
        TEST_KEY_HASHES.create,
      );

    assert.ok(
      persisted,
    );

    assert.equal(
      persisted.failureCount,
      1,
    );

    assert.deepEqual(
      persisted.windowStartedAt,
      now,
    );

    assert.equal(
      persisted.blockedUntil,
      null,
    );
  },
);

test(
  'password-account throttle blocks at five failures and does not increment while blocked',
  async () => {
    let finalTransition;

    for (
      let index = 0;
      index < 5;
      index += 1
    ) {
      const result =
        await recordAuthThrottleFailure(
          'password_account',
          TEST_KEY_HASHES.threshold,
          addMilliseconds(
            BASE_TIME,
            index * 1_000,
          ),
        );

      assert.equal(
        result.blocked,
        false,
      );

      finalTransition =
        result.state;
    }

    assert.ok(
      finalTransition,
    );

    assert.equal(
      finalTransition.failureCount,
      5,
    );

    assert.deepEqual(
      finalTransition.blockedUntil,
      addMilliseconds(
        BASE_TIME,
        4_000 +
          15 * 60 * 1_000,
      ),
    );

    const blockedResult =
      await recordAuthThrottleFailure(
        'password_account',
        TEST_KEY_HASHES.threshold,
        addMilliseconds(
          BASE_TIME,
          5_000,
        ),
      );

    assert.equal(
      blockedResult.blocked,
      true,
    );

    assert.equal(
      blockedResult.state.failureCount,
      5,
    );

    const persisted =
      await getAuthThrottleState(
        'password_account',
        TEST_KEY_HASHES.threshold,
      );

    assert.ok(
      persisted,
    );

    assert.equal(
      persisted.failureCount,
      5,
    );
  },
);

test(
  'expired throttle window starts a fresh failure window',
  async () => {
    const first =
      await recordAuthThrottleFailure(
        'password_account',
        TEST_KEY_HASHES.windowReset,
        BASE_TIME,
      );

    assert.equal(
      first.blocked,
      false,
    );

    assert.equal(
      first.state.failureCount,
      1,
    );

    const nextWindowTime =
      addMilliseconds(
        BASE_TIME,
        15 * 60 * 1_000,
      );

    const second =
      await recordAuthThrottleFailure(
        'password_account',
        TEST_KEY_HASHES.windowReset,
        nextWindowTime,
      );

    assert.equal(
      second.blocked,
      false,
    );

    assert.equal(
      second.state.failureCount,
      1,
    );

    assert.deepEqual(
      second.state.windowStartedAt,
      nextWindowTime,
    );

    assert.equal(
      second.state.blockedUntil,
      null,
    );
  },
);

test(
  'explicit throttle reset persists the pure reset transition',
  async () => {
    await recordAuthThrottleFailure(
      'mfa_account',
      TEST_KEY_HASHES.explicitReset,
      BASE_TIME,
    );

    const resetTime =
      addMilliseconds(
        BASE_TIME,
        60_000,
      );

    await resetAuthThrottle(
      'mfa_account',
      TEST_KEY_HASHES.explicitReset,
      resetTime,
    );

    const state =
      await getAuthThrottleState(
        'mfa_account',
        TEST_KEY_HASHES.explicitReset,
      );

    assert.ok(
      state,
    );

    assert.equal(
      state.failureCount,
      0,
    );

    assert.deepEqual(
      state.windowStartedAt,
      resetTime,
    );

    assert.equal(
      state.blockedUntil,
      null,
    );
  },
);

test(
  'concurrent failures on a missing throttle row do not lose an update',
  async () => {
    const now =
      cloneDate(
        BASE_TIME,
      );

    const results =
      await Promise.all([
        recordAuthThrottleFailure(
          'password_ip',
          TEST_KEY_HASHES.concurrency,
          now,
        ),

        recordAuthThrottleFailure(
          'password_ip',
          TEST_KEY_HASHES.concurrency,
          now,
        ),
      ]);

    for (const result of results) {
      assert.equal(
        result.blocked,
        false,
      );
    }

    const state =
      await getAuthThrottleState(
        'password_ip',
        TEST_KEY_HASHES.concurrency,
      );

    assert.ok(
      state,
    );

    assert.equal(
      state.failureCount,
      2,
    );

    assert.deepEqual(
      state.windowStartedAt,
      now,
    );
  },
);

test(
  'throttle lookup rejects non-canonical hashes before querying persistence',
  async () => {
    await assert.rejects(
      () =>
        getAuthThrottleState(
          'password_account',
          'A'.repeat(64),
        ),
      /lowercase SHA-256 hex hash/u,
    );
  },
);