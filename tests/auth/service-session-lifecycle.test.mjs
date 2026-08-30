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

const originalDatabaseUrl =
  process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for session-lifecycle tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for session-lifecycle tests.',
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

process.env.DATABASE_URL =
  testDatabaseUrl;

const [
  {
    resolveAdminSession,
    revokeAdminSession,
    revokeAllAdminSessions,
  },
  {
    closeDatabase,
  },
  {
    runAuthTransaction,
  },
  {
    createAdminSessionTiming,
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
      '../../src/server/auth/persistence.ts'
    ),
    import(
      '../../src/server/auth/service-foundation.ts'
    ),
    import(
      '../../src/server/auth/tokens.ts'
    ),
  ]);

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max: 2,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const BASE_TIME =
  new Date(
    '2026-08-29T17:00:00.000Z',
  );

const TEST_PASSWORD_HASH =
  'session-lifecycle-test-password-hash';

const TEST_ADMINS = {
  target: {
    id:
      '00000000-0000-4000-8000-000000006c01',
    email:
      'service-session-lifecycle@example.test',
  },

  other: {
    id:
      '00000000-0000-4000-8000-000000006c02',
    email:
      'service-session-lifecycle-other@example.test',
  },
};

const TEST_ADMIN =
  TEST_ADMINS.target;

function addMilliseconds(
  value,
  milliseconds,
) {
  return new Date(
    value.getTime() +
      milliseconds,
  );
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

async function cleanupFixture() {
  for (
    const admin of
    Object.values(
      TEST_ADMINS,
    )
  ) {
    await migrationSql`
      delete
      from admin_sessions
      where admin_id =
        ${admin.id}
    `;

    await migrationSql`
      delete
      from admins
      where id =
        ${admin.id}
    `;
  }
}

async function insertAdmin(
  {
    admin =
      TEST_ADMIN,
    isActive = true,
  } = {},
) {
  await migrationSql`
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
      ${isActive},
      ${BASE_TIME},
      ${BASE_TIME},
      ${BASE_TIME}
    )
  `;
}

async function insertSession(
  {
    admin =
      TEST_ADMIN,
    sessionToken =
      generateOpaqueAuthToken(),
    authMethod =
      'totp',
    now =
      BASE_TIME,
  } = {},
) {
  const tokenHash =
    hashOpaqueAuthToken(
      sessionToken,
    );

  const timing =
    createAdminSessionTiming(
      now,
    );

  const record =
    await runAuthTransaction(
      (tx) =>
        tx.insertAdminSession({
          adminId:
            admin.id,
          tokenHash,
          authMethod,
          timing,
        }),
    );

  return {
    sessionToken,
    tokenHash,
    record,
  };
}

async function readSession(
  tokenHash,
) {
  const rows =
    await migrationSql`
      select
        id,
        admin_id,
        auth_method,
        created_at,
        last_seen_at,
        idle_expires_at,
        absolute_expires_at,
        revoked_at,
        revocation_reason
      from admin_sessions
      where token_hash =
        ${tokenHash}
      limit 1
    `;

  return rows[0] ?? null;
}

before(
  async () => {
    await assertTestDatabase();
    await cleanupFixture();
  },
);

afterEach(
  async () => {
    await cleanupFixture();
  },
);

after(
  async () => {
    try {
      await closeDatabase();
      await cleanupFixture();
    } finally {
      await closeDatabase();

      await migrationSql.end({
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
  'active admin session resolves without touching before the five-minute touch interval',
  async () => {
    await insertAdmin();

    const {
      sessionToken,
      tokenHash,
      record,
    } =
      await insertSession();

    const resolveAt =
      addMilliseconds(
        BASE_TIME,
        4 * 60 * 1_000 +
          59_000,
      );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          resolveAt,
      });

    assert.ok(resolved);

    assert.equal(
      resolved.sessionId,
      record.id,
    );

    assert.deepEqual(
      resolved.admin,
      {
        id:
          TEST_ADMIN.id,
        email:
          TEST_ADMIN.email,
      },
    );

    assert.equal(
      resolved.authMethod,
      'totp',
    );

    assert.deepEqual(
      resolved.createdAt,
      record.createdAt,
    );

    assert.deepEqual(
      resolved.lastSeenAt,
      record.lastSeenAt,
    );

    assert.deepEqual(
      resolved.idleExpiresAt,
      record.idleExpiresAt,
    );

    assert.deepEqual(
      resolved.absoluteExpiresAt,
      record.absoluteExpiresAt,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.last_seen_at,
      record.lastSeenAt,
    );

    assert.deepEqual(
      persisted.idle_expires_at,
      record.idleExpiresAt,
    );

    assert.equal(
      persisted.revoked_at,
      null,
    );

    assert.equal(
      persisted.revocation_reason,
      null,
    );
  },
);

test(
  'active admin session touches exactly at the five-minute boundary and extends idle expiry without changing absolute expiry',
  async () => {
    await insertAdmin();

    const {
      sessionToken,
      tokenHash,
      record,
    } =
      await insertSession();

    const resolveAt =
      addMilliseconds(
        BASE_TIME,
        5 * 60 * 1_000,
      );

    const expectedIdleExpiresAt =
      addMilliseconds(
        resolveAt,
        30 * 60 * 1_000,
      );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          resolveAt,
      });

    assert.ok(resolved);

    assert.equal(
      resolved.sessionId,
      record.id,
    );

    assert.deepEqual(
      resolved.admin,
      {
        id:
          TEST_ADMIN.id,
        email:
          TEST_ADMIN.email,
      },
    );

    assert.deepEqual(
      resolved.lastSeenAt,
      resolveAt,
    );

    assert.deepEqual(
      resolved.idleExpiresAt,
      expectedIdleExpiresAt,
    );

    assert.deepEqual(
      resolved.absoluteExpiresAt,
      record.absoluteExpiresAt,
    );

    assert.notDeepEqual(
      resolved.lastSeenAt,
      record.lastSeenAt,
    );

    assert.notDeepEqual(
      resolved.idleExpiresAt,
      record.idleExpiresAt,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.last_seen_at,
      resolveAt,
    );

    assert.deepEqual(
      persisted.idle_expires_at,
      expectedIdleExpiresAt,
    );

    assert.deepEqual(
      persisted.absolute_expires_at,
      record.absoluteExpiresAt,
    );

    assert.equal(
      persisted.revoked_at,
      null,
    );

    assert.equal(
      persisted.revocation_reason,
      null,
    );
  },
);

test(
  'idle-expired admin session resolves to null and is atomically revoked with idle_timeout',
  async () => {
    await insertAdmin();

    const {
      sessionToken,
      tokenHash,
      record,
    } =
      await insertSession();

    const resolveAt =
      new Date(
        record.idleExpiresAt
          .getTime(),
      );

    assert.ok(
      resolveAt.getTime() <
        record.absoluteExpiresAt
          .getTime(),
    );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          resolveAt,
      });

    assert.equal(
      resolved,
      null,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.revoked_at,
      resolveAt,
    );

    assert.equal(
      persisted.revocation_reason,
      'idle_timeout',
    );

    assert.deepEqual(
      persisted.last_seen_at,
      record.lastSeenAt,
    );

    assert.deepEqual(
      persisted.idle_expires_at,
      record.idleExpiresAt,
    );

    assert.deepEqual(
      persisted.absolute_expires_at,
      record.absoluteExpiresAt,
    );
  },
);

test(
  'absolute expiry takes precedence when absolute and idle expiry are reached together',
  async () => {
    await insertAdmin();

    const sessionToken =
      generateOpaqueAuthToken();

    const tokenHash =
      hashOpaqueAuthToken(
        sessionToken,
      );

    const absoluteExpiresAt =
      addMilliseconds(
        BASE_TIME,
        8 * 60 * 60 * 1_000,
      );

    const lastSeenAt =
      addMilliseconds(
        absoluteExpiresAt,
        -5 * 60 * 1_000,
      );

    const idleExpiresAt =
      new Date(
        absoluteExpiresAt
          .getTime(),
      );

    const record =
      await runAuthTransaction(
        (tx) =>
          tx.insertAdminSession({
            adminId:
              TEST_ADMIN.id,
            tokenHash,
            authMethod:
              'recovery',
            timing: {
              createdAt:
                BASE_TIME,
              lastSeenAt,
              idleExpiresAt,
              absoluteExpiresAt,
            },
          }),
      );

    const resolveAt =
      new Date(
        absoluteExpiresAt
          .getTime(),
      );

    assert.equal(
      resolveAt.getTime(),
      idleExpiresAt.getTime(),
    );

    assert.equal(
      resolveAt.getTime(),
      absoluteExpiresAt.getTime(),
    );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          resolveAt,
      });

    assert.equal(
      resolved,
      null,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.revoked_at,
      resolveAt,
    );

    assert.equal(
      persisted.revocation_reason,
      'absolute_timeout',
    );

    assert.deepEqual(
      persisted.created_at,
      record.createdAt,
    );

    assert.deepEqual(
      persisted.last_seen_at,
      lastSeenAt,
    );

    assert.deepEqual(
      persisted.idle_expires_at,
      idleExpiresAt,
    );

    assert.deepEqual(
      persisted.absolute_expires_at,
      absoluteExpiresAt,
    );
  },
);

test(
  'session for a disabled admin resolves to null and is atomically revoked with admin_disabled',
  async () => {
    await insertAdmin({
      isActive: false,
    });

    const {
      sessionToken,
      tokenHash,
      record,
    } =
      await insertSession();

    const resolveAt =
      addMilliseconds(
        BASE_TIME,
        60 * 1_000,
      );

    assert.ok(
      resolveAt.getTime() <
        record.idleExpiresAt
          .getTime(),
    );

    assert.ok(
      resolveAt.getTime() <
        record.absoluteExpiresAt
          .getTime(),
    );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          resolveAt,
      });

    assert.equal(
      resolved,
      null,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.revoked_at,
      resolveAt,
    );

    assert.equal(
      persisted.revocation_reason,
      'admin_disabled',
    );

    assert.deepEqual(
      persisted.last_seen_at,
      record.lastSeenAt,
    );

    assert.deepEqual(
      persisted.idle_expires_at,
      record.idleExpiresAt,
    );

    assert.deepEqual(
      persisted.absolute_expires_at,
      record.absoluteExpiresAt,
    );
  },
);

test(
  'single-session revocation is idempotent terminal and preserves the first revocation reason and timestamp',
  async () => {
    await insertAdmin();

    const {
      sessionToken,
      tokenHash,
    } =
      await insertSession();

    const firstRevokedAt =
      addMilliseconds(
        BASE_TIME,
        60 * 1_000,
      );

    await revokeAdminSession({
      sessionToken,
      reason: 'logout',
      now:
        firstRevokedAt,
    });

    const afterFirst =
      await readSession(
        tokenHash,
      );

    assert.ok(afterFirst);

    assert.deepEqual(
      afterFirst.revoked_at,
      firstRevokedAt,
    );

    assert.equal(
      afterFirst.revocation_reason,
      'logout',
    );

    const secondRevokedAt =
      addMilliseconds(
        firstRevokedAt,
        60 * 1_000,
      );

    await revokeAdminSession({
      sessionToken,
      reason: 'admin_disabled',
      now:
        secondRevokedAt,
    });

    const afterSecond =
      await readSession(
        tokenHash,
      );

    assert.ok(afterSecond);

    assert.deepEqual(
      afterSecond.revoked_at,
      firstRevokedAt,
    );

    assert.equal(
      afterSecond.revocation_reason,
      'logout',
    );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          secondRevokedAt,
      });

    assert.equal(
      resolved,
      null,
    );
  },
);

test(
  'bulk session revocation returns the exact active-session count preserves prior terminal state and isolates other admins',
  async () => {
    await insertAdmin({
      admin:
        TEST_ADMINS.target,
    });

    await insertAdmin({
      admin:
        TEST_ADMINS.other,
    });

    const alreadyRevoked =
      await insertSession({
        admin:
          TEST_ADMINS.target,
      });

    const targetActiveOne =
      await insertSession({
        admin:
          TEST_ADMINS.target,
      });

    const targetActiveTwo =
      await insertSession({
        admin:
          TEST_ADMINS.target,
        authMethod: 'recovery',
      });

    const otherActive =
      await insertSession({
        admin:
          TEST_ADMINS.other,
      });

    const initialRevokedAt =
      addMilliseconds(
        BASE_TIME,
        30 * 1_000,
      );

    await revokeAdminSession({
      sessionToken:
        alreadyRevoked
          .sessionToken,
      reason: 'logout',
      now:
        initialRevokedAt,
    });

    const bulkRevokedAt =
      addMilliseconds(
        BASE_TIME,
        60 * 1_000,
      );

    const count =
      await revokeAllAdminSessions({
        adminId:
          TEST_ADMINS.target.id,
        reason: 'password_changed',
        now:
          bulkRevokedAt,
      });

    assert.equal(
      count,
      2,
    );

    const secondCount =
      await revokeAllAdminSessions({
        adminId:
          TEST_ADMINS.target.id,
        reason: 'mfa_reset',
        now:
          addMilliseconds(
            bulkRevokedAt,
            1_000,
          ),
      });

    assert.equal(
      secondCount,
      0,
    );

    const oldRecord =
      await readSession(
        alreadyRevoked
          .tokenHash,
      );

    const targetRecordOne =
      await readSession(
        targetActiveOne
          .tokenHash,
      );

    const targetRecordTwo =
      await readSession(
        targetActiveTwo
          .tokenHash,
      );

    const otherRecord =
      await readSession(
        otherActive
          .tokenHash,
      );

    assert.ok(oldRecord);
    assert.ok(targetRecordOne);
    assert.ok(targetRecordTwo);
    assert.ok(otherRecord);

    assert.deepEqual(
      oldRecord.revoked_at,
      initialRevokedAt,
    );

    assert.equal(
      oldRecord.revocation_reason,
      'logout',
    );

    for (
      const record of [
        targetRecordOne,
        targetRecordTwo,
      ]
    ) {
      assert.deepEqual(
        record.revoked_at,
        bulkRevokedAt,
      );

      assert.equal(
        record.revocation_reason,
        'password_changed',
      );
    }

    assert.equal(
      otherRecord.revoked_at,
      null,
    );

    assert.equal(
      otherRecord.revocation_reason,
      null,
    );

    const otherResolved =
      await resolveAdminSession({
        sessionToken:
          otherActive
            .sessionToken,
        now:
          bulkRevokedAt,
      });

    assert.ok(otherResolved);

    assert.equal(
      otherResolved.admin.id,
      TEST_ADMINS.other.id,
    );
  },
);


test(
  'missing session token resolves to null and single-session revocation is a no-op',
  async () => {
    const sessionToken =
      generateOpaqueAuthToken();

    const tokenHash =
      hashOpaqueAuthToken(
        sessionToken,
      );

    const before =
      await readSession(
        tokenHash,
      );

    assert.equal(
      before,
      null,
    );

    const resolved =
      await resolveAdminSession({
        sessionToken,
        now:
          BASE_TIME,
      });

    assert.equal(
      resolved,
      null,
    );

    await revokeAdminSession({
      sessionToken,
      reason: 'logout',
      now:
        BASE_TIME,
    });

    const after =
      await readSession(
        tokenHash,
      );

    assert.equal(
      after,
      null,
    );
  },
);

test(
  'bulk session revocation for an unknown admin returns zero without affecting existing admins',
  async () => {
    await insertAdmin();

    const existing =
      await insertSession();

    const count =
      await revokeAllAdminSessions({
        adminId:
          '00000000-0000-4000-8000-000000006cff',
        reason: 'admin_disabled',
        now:
          addMilliseconds(
            BASE_TIME,
            60 * 1_000,
          ),
      });

    assert.equal(
      count,
      0,
    );

    const persisted =
      await readSession(
        existing.tokenHash,
      );

    assert.ok(persisted);

    assert.equal(
      persisted.revoked_at,
      null,
    );

    assert.equal(
      persisted.revocation_reason,
      null,
    );

    const resolved =
      await resolveAdminSession({
        sessionToken:
          existing.sessionToken,
        now:
          addMilliseconds(
            BASE_TIME,
            60 * 1_000,
          ),
      });

    assert.ok(resolved);

    assert.equal(
      resolved.admin.id,
      TEST_ADMIN.id,
    );
  },
);

test(
  'session lifecycle services reject invalid Date inputs before persistence work',
  async () => {
    const invalidDate =
      new Date(
        Number.NaN,
      );

    const sessionToken =
      generateOpaqueAuthToken();

    await assert.rejects(
      resolveAdminSession({
        sessionToken,
        now:
          invalidDate,
      }),
      /Admin session resolution time must be a valid Date\./,
    );

    await assert.rejects(
      revokeAdminSession({
        sessionToken,
        reason: 'logout',
        now:
          invalidDate,
      }),
      /Admin session revocation time must be a valid Date\./,
    );

    await assert.rejects(
      revokeAllAdminSessions({
        adminId:
          TEST_ADMIN.id,
        reason: 'logout',
        now:
          invalidDate,
      }),
      /Admin session bulk revocation time must be a valid Date\./,
    );
  },
);

test(
  'revocation services reject invalid reasons without mutating an active session',
  async () => {
    await insertAdmin();

    const existing =
      await insertSession();

    const revokeAt =
      addMilliseconds(
        BASE_TIME,
        60 * 1_000,
      );

    await assert.rejects(
      revokeAdminSession({
        sessionToken:
          existing.sessionToken,
        reason: 'not_a_reason',
        now:
          revokeAt,
      }),
      /Invalid admin session revocation reason\./,
    );

    await assert.rejects(
      revokeAllAdminSessions({
        adminId:
          TEST_ADMIN.id,
        reason: 'not_a_reason',
        now:
          revokeAt,
      }),
      /Invalid admin session revocation reason\./,
    );

    const persisted =
      await readSession(
        existing.tokenHash,
      );

    assert.ok(persisted);

    assert.equal(
      persisted.revoked_at,
      null,
    );

    assert.equal(
      persisted.revocation_reason,
      null,
    );

    const resolved =
      await resolveAdminSession({
        sessionToken:
          existing.sessionToken,
        now:
          revokeAt,
      });

    assert.ok(resolved);

    assert.equal(
      resolved.sessionId,
      existing.record.id,
    );
  },
);

test(
  'concurrent session resolves at the touch boundary serialize safely and converge on one persisted touched state',
  async () => {
    await insertAdmin();

    const {
      sessionToken,
      tokenHash,
      record,
    } =
      await insertSession();

    const resolveAt =
      addMilliseconds(
        BASE_TIME,
        5 * 60 * 1_000,
      );

    const expectedIdleExpiresAt =
      addMilliseconds(
        resolveAt,
        30 * 60 * 1_000,
      );

    const [
      first,
      second,
    ] =
      await Promise.all([
        resolveAdminSession({
          sessionToken,
          now:
            resolveAt,
        }),
        resolveAdminSession({
          sessionToken,
          now:
            resolveAt,
        }),
      ]);

    assert.ok(first);
    assert.ok(second);

    for (
      const resolved of [
        first,
        second,
      ]
    ) {
      assert.equal(
        resolved.sessionId,
        record.id,
      );

      assert.equal(
        resolved.admin.id,
        TEST_ADMIN.id,
      );

      assert.deepEqual(
        resolved.lastSeenAt,
        resolveAt,
      );

      assert.deepEqual(
        resolved.idleExpiresAt,
        expectedIdleExpiresAt,
      );

      assert.deepEqual(
        resolved.absoluteExpiresAt,
        record.absoluteExpiresAt,
      );
    }

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.last_seen_at,
      resolveAt,
    );

    assert.deepEqual(
      persisted.idle_expires_at,
      expectedIdleExpiresAt,
    );

    assert.deepEqual(
      persisted.absolute_expires_at,
      record.absoluteExpiresAt,
    );

    assert.equal(
      persisted.revoked_at,
      null,
    );

    assert.equal(
      persisted.revocation_reason,
      null,
    );
  },
);

test(
  'concurrent session resolution and bulk revocation complete without deadlock and converge on terminal revocation',
  { timeout: 10_000 },
  async () => {
    await insertAdmin();

    const existing =
      await insertSession();

    const resolveAt =
      addMilliseconds(
        BASE_TIME,
        5 * 60 * 1_000,
      );

    const bulkRevokedAt =
      addMilliseconds(
        resolveAt,
        1_000,
      );

    const [
      resolved,
      revokedCount,
    ] =
      await Promise.all([
        resolveAdminSession({
          sessionToken:
            existing.sessionToken,
          now:
            resolveAt,
        }),
        revokeAllAdminSessions({
          adminId:
            TEST_ADMIN.id,
          reason: 'password_changed',
          now:
            bulkRevokedAt,
        }),
      ]);

    assert.equal(
      revokedCount,
      1,
    );

    if (resolved !== null) {
      assert.equal(
        resolved.sessionId,
        existing.record.id,
      );

      assert.equal(
        resolved.admin.id,
        TEST_ADMIN.id,
      );
    }

    const persisted =
      await readSession(
        existing.tokenHash,
      );

    assert.ok(persisted);

    assert.deepEqual(
      persisted.revoked_at,
      bulkRevokedAt,
    );

    assert.equal(
      persisted.revocation_reason,
      'password_changed',
    );

    const after =
      await resolveAdminSession({
        sessionToken:
          existing.sessionToken,
        now:
          addMilliseconds(
            bulkRevokedAt,
            1_000,
          ),
      });

    assert.equal(
      after,
      null,
    );
  },
);
