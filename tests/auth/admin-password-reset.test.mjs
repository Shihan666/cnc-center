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
  process.env
    .DATABASE_URL
    ?.trim();

const originalMigrationUrl =
  process.env
    .DATABASE_MIGRATION_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for Admin password-reset tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for Admin password-reset tests.',
  );
}

if (
  originalDatabaseUrl &&
  originalDatabaseUrl ===
    testDatabaseUrl
) {
  throw new Error(
    'TEST_DATABASE_URL must not equal DATABASE_URL.',
  );
}

if (
  originalMigrationUrl &&
  originalMigrationUrl ===
    testMigrationUrl
) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL must not equal DATABASE_MIGRATION_URL.',
  );
}

if (
  testDatabaseUrl ===
  testMigrationUrl
) {
  throw new Error(
    'Reset tests require separate runtime and migration credentials.',
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

process.env.DATABASE_MIGRATION_URL =
  testMigrationUrl;

const [
  {
    resetAdminPassword,
  },
  {
    hashPassword,
    verifyPassword,
  },
] =
  await Promise.all([
    import(
      '../../scripts/admin-password-reset-core.mjs'
    ),

    import(
      '../../src/server/auth/password.ts'
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

const runtimeProbe =
  postgres(
    testDatabaseUrl,
    {
      max: 1,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const TARGET_ADMIN = {
  id:
    '00000000-0000-4000-8000-000000009101',

  email:
    'password-reset-target@example.test',
};

const INACTIVE_ADMIN = {
  id:
    '00000000-0000-4000-8000-000000009102',

  email:
    'password-reset-inactive@example.test',
};

const ACTIVE_SESSION_ID =
  '00000000-0000-4000-8000-000000009201';

const REVOKED_SESSION_ID =
  '00000000-0000-4000-8000-000000009202';

const ACTIVE_CHALLENGE_ID =
  '00000000-0000-4000-8000-000000009301';

const CONSUMED_CHALLENGE_ID =
  '00000000-0000-4000-8000-000000009302';

const BASE_TIME =
  new Date(
    '2026-08-29T10:00:00.000Z',
  );

const ACTIVE_SESSION_HASH =
  '11'.repeat(32);

const REVOKED_SESSION_HASH =
  '22'.repeat(32);

const ACTIVE_CHALLENGE_HASH =
  '33'.repeat(32);

const CONSUMED_CHALLENGE_HASH =
  '44'.repeat(32);

const OLD_PASSWORD =
  'Old-Password-For-Reset-1!';

const NEW_PASSWORD =
  'New-Password-For-Reset-2!';

const INACTIVE_NEW_PASSWORD =
  'Inactive-New-Password-3!';

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
  const [
    migrationInfo,
    runtimeInfo,
  ] =
    await Promise.all([
      migrationSql`
        select
          current_database()
            as database_name,
          current_user
            as role_name
      `,

      runtimeProbe`
        select
          current_database()
            as database_name,
          current_user
            as role_name
      `,
    ]);

  assert.equal(
    migrationInfo[0]
      ?.database_name,
    EXPECTED_TEST_DATABASE,
  );

  assert.equal(
    runtimeInfo[0]
      ?.database_name,
    EXPECTED_TEST_DATABASE,
  );

  assert.notEqual(
    migrationInfo[0]
      ?.role_name,
    runtimeInfo[0]
      ?.role_name,
  );
}

async function cleanupFixture() {
  const adminIds = [
    TARGET_ADMIN.id,
    INACTIVE_ADMIN.id,
  ];

  await migrationSql`
    delete
    from admin_login_challenges
    where admin_id in
      ${migrationSql(adminIds)}
  `;

  await migrationSql`
    delete
    from admin_sessions
    where admin_id in
      ${migrationSql(adminIds)}
  `;

  await migrationSql`
    delete
    from admins
    where id in
      ${migrationSql(adminIds)}
  `;
}

async function insertAdmin({
  admin,
  passwordHash,
  isActive,
}) {
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
      ${passwordHash},
      ${isActive},
      ${BASE_TIME},
      ${BASE_TIME},
      ${BASE_TIME}
    )
  `;
}

async function readAdmin(
  adminId,
) {
  const [row] =
    await migrationSql`
      select
        id,
        email,
        password_hash,
        is_active,
        password_changed_at,
        updated_at
      from admins
      where id =
        ${adminId}
      limit 1
    `;

  return row ?? null;
}

async function insertSessionFixtures() {
  const idleExpiry =
    addMilliseconds(
      BASE_TIME,
      30 * 60 * 1000,
    );

  const absoluteExpiry =
    addMilliseconds(
      BASE_TIME,
      8 * 60 * 60 * 1000,
    );

  const alreadyRevokedAt =
    addMilliseconds(
      BASE_TIME,
      5 * 60 * 1000,
    );

  await migrationSql`
    insert into admin_sessions (
      id,
      admin_id,
      token_hash,
      auth_method,
      created_at,
      last_seen_at,
      idle_expires_at,
      absolute_expires_at,
      revoked_at,
      revocation_reason
    )
    values (
      ${ACTIVE_SESSION_ID},
      ${TARGET_ADMIN.id},
      ${ACTIVE_SESSION_HASH},
      'totp',
      ${BASE_TIME},
      ${BASE_TIME},
      ${idleExpiry},
      ${absoluteExpiry},
      null,
      null
    )
  `;

  await migrationSql`
    insert into admin_sessions (
      id,
      admin_id,
      token_hash,
      auth_method,
      created_at,
      last_seen_at,
      idle_expires_at,
      absolute_expires_at,
      revoked_at,
      revocation_reason
    )
    values (
      ${REVOKED_SESSION_ID},
      ${TARGET_ADMIN.id},
      ${REVOKED_SESSION_HASH},
      'totp',
      ${BASE_TIME},
      ${BASE_TIME},
      ${idleExpiry},
      ${absoluteExpiry},
      ${alreadyRevokedAt},
      'logout'
    )
  `;

  return {
    alreadyRevokedAt,
  };
}

async function insertChallengeFixtures() {
  const expiresAt =
    addMilliseconds(
      BASE_TIME,
      5 * 60 * 1000,
    );

  const consumedAt =
    addMilliseconds(
      BASE_TIME,
      60 * 1000,
    );

  await migrationSql`
    insert into admin_login_challenges (
      id,
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
      ${ACTIVE_CHALLENGE_ID},
      ${TARGET_ADMIN.id},
      ${ACTIVE_CHALLENGE_HASH},
      'enrollment',
      0,
      ${expiresAt},
      null,
      null,
      ${BASE_TIME}
    )
  `;

  await migrationSql`
    insert into admin_login_challenges (
      id,
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
      ${CONSUMED_CHALLENGE_ID},
      ${TARGET_ADMIN.id},
      ${CONSUMED_CHALLENGE_HASH},
      'enrollment',
      0,
      ${expiresAt},
      ${consumedAt},
      null,
      ${BASE_TIME}
    )
  `;

  return {
    consumedAt,
  };
}

async function readSession(
  sessionId,
) {
  const [row] =
    await migrationSql`
      select
        id,
        revoked_at,
        revocation_reason
      from admin_sessions
      where id =
        ${sessionId}
      limit 1
    `;

  return row ?? null;
}

async function readChallenge(
  challengeId,
) {
  const [row] =
    await migrationSql`
      select
        id,
        consumed_at,
        invalidated_at
      from admin_login_challenges
      where id =
        ${challengeId}
      limit 1
    `;

  return row ?? null;
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
      await cleanupFixture();
    } finally {
      await Promise.all([
        migrationSql.end({
          timeout: 5,
        }),

        runtimeProbe.end({
          timeout: 5,
        }),
      ]);

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
        originalMigrationUrl ===
        undefined
      ) {
        delete process.env
          .DATABASE_MIGRATION_URL;
      } else {
        process.env
          .DATABASE_MIGRATION_URL =
          originalMigrationUrl;
      }
    }
  },
);

test(
  'password reset atomically changes credential revokes active sessions and invalidates active challenges',
  async () => {
    const oldPasswordHash =
      await hashPassword(
        OLD_PASSWORD,
      );

    await insertAdmin({
      admin:
        TARGET_ADMIN,

      passwordHash:
        oldPasswordHash,

      isActive:
        true,
    });

    const {
      alreadyRevokedAt,
    } =
      await insertSessionFixtures();

    const {
      consumedAt,
    } =
      await insertChallengeFixtures();

    const beforeReset =
      Date.now();

    const result =
      await resetAdminPassword({
        email:
          '  PASSWORD-RESET-TARGET@EXAMPLE.TEST  ',

        password:
          NEW_PASSWORD,
      });

    const afterReset =
      Date.now();

    assert.equal(
      result.ok,
      true,
    );

    assert.equal(
      result.admin.email,
      TARGET_ADMIN.email,
    );

    assert.equal(
      result.revokedSessionCount,
      1,
    );

    assert.equal(
      result.invalidatedChallengeCount,
      1,
    );

    const admin =
      await readAdmin(
        TARGET_ADMIN.id,
      );

    assert.ok(admin);

    assert.equal(
      admin.is_active,
      true,
    );

    assert.equal(
      await verifyPassword(
        NEW_PASSWORD,
        admin.password_hash,
      ),
      true,
    );

    assert.equal(
      await verifyPassword(
        OLD_PASSWORD,
        admin.password_hash,
      ),
      false,
    );

    const passwordChangedAt =
      admin
        .password_changed_at
        .getTime();

    const updatedAt =
      admin
        .updated_at
        .getTime();

    assert.ok(
      passwordChangedAt >=
        beforeReset,
    );

    assert.ok(
      passwordChangedAt <=
        afterReset,
    );

    assert.equal(
      updatedAt,
      passwordChangedAt,
    );

    const activeSession =
      await readSession(
        ACTIVE_SESSION_ID,
      );

    assert.ok(
      activeSession
        ?.revoked_at,
    );

    assert.equal(
      activeSession
        .revocation_reason,
      'password_changed',
    );

    assert.equal(
      activeSession
        .revoked_at
        .getTime(),
      passwordChangedAt,
    );

    const previouslyRevokedSession =
      await readSession(
        REVOKED_SESSION_ID,
      );

    assert.ok(
      previouslyRevokedSession,
    );

    assert.equal(
      previouslyRevokedSession
        .revocation_reason,
      'logout',
    );

    assert.equal(
      previouslyRevokedSession
        .revoked_at
        .getTime(),
      alreadyRevokedAt
        .getTime(),
    );

    const activeChallenge =
      await readChallenge(
        ACTIVE_CHALLENGE_ID,
      );

    assert.equal(
      activeChallenge
        ?.consumed_at,
      null,
    );

    assert.ok(
      activeChallenge
        ?.invalidated_at,
    );

    assert.equal(
      activeChallenge
        .invalidated_at
        .getTime(),
      passwordChangedAt,
    );

    const consumedChallenge =
      await readChallenge(
        CONSUMED_CHALLENGE_ID,
      );

    assert.ok(
      consumedChallenge,
    );

    assert.equal(
      consumedChallenge
        .consumed_at
        .getTime(),
      consumedAt
        .getTime(),
    );

    assert.equal(
      consumedChallenge
        .invalidated_at,
      null,
    );
  },
);

test(
  'inactive Admin reset fails closed and preserves the credential',
  async () => {
    const originalHash =
      await hashPassword(
        OLD_PASSWORD,
      );

    await insertAdmin({
      admin:
        INACTIVE_ADMIN,

      passwordHash:
        originalHash,

      isActive:
        false,
    });

    const result =
      await resetAdminPassword({
        email:
          INACTIVE_ADMIN.email,

        password:
          INACTIVE_NEW_PASSWORD,
      });

    assert.deepEqual(
      result,
      {
        ok:
          false,

        reason:
          'admin_inactive',
      },
    );

    const admin =
      await readAdmin(
        INACTIVE_ADMIN.id,
      );

    assert.ok(admin);

    assert.equal(
      admin.password_hash,
      originalHash,
    );

    assert.equal(
      admin.password_changed_at
        .getTime(),
      BASE_TIME.getTime(),
    );

    assert.equal(
      admin.updated_at
        .getTime(),
      BASE_TIME.getTime(),
    );
  },
);

test(
  'missing Admin reset fails closed without creating an account',
  async () => {
    const result =
      await resetAdminPassword({
        email:
          'password-reset-missing@example.test',

        password:
          NEW_PASSWORD,
      });

    assert.deepEqual(
      result,
      {
        ok:
          false,

        reason:
          'admin_not_found',
      },
    );

    const [row] =
      await migrationSql`
        select
          count(*)::integer
            as count
        from admins
        where email =
          'password-reset-missing@example.test'
      `;

    assert.equal(
      Number(
        row.count,
      ),
      0,
    );
  },
);
