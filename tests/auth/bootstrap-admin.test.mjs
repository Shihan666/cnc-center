import assert from 'node:assert/strict';

import test, {
  after,
  afterEach,
  before,
  beforeEach,
} from 'node:test';

import postgres from 'postgres';

const testRuntimeUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

const testMigrationUrl =
  process.env
    .TEST_DATABASE_MIGRATION_URL
    ?.trim();

if (!testRuntimeUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for Admin bootstrap tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for Admin bootstrap tests.',
  );
}

if (
  testRuntimeUrl ===
  testMigrationUrl
) {
  throw new Error(
    'Test runtime and migration credentials must differ.',
  );
}

const originalRuntimeUrl =
  process.env.DATABASE_URL;

const originalMigrationUrl =
  process.env
    .DATABASE_MIGRATION_URL;

process.env.DATABASE_URL =
  testRuntimeUrl;

process.env.DATABASE_MIGRATION_URL =
  testMigrationUrl;

const [
  {
    createFirstAdmin,
  },
  {
    verifyPassword,
  },
] =
  await Promise.all([
    import(
      '../../scripts/admin-bootstrap-core.mjs'
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

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

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

async function cleanupAdminState() {
  await assertTestDatabase();

  await migrationSql`
    delete from
      admin_login_challenges
  `;

  await migrationSql`
    delete from
      admin_recovery_codes
  `;

  await migrationSql`
    delete from
      admin_sessions
  `;

  await migrationSql`
    delete from
      admin_totp_factors
  `;

  await migrationSql`
    delete from
      admins
  `;
}

async function getAdmins() {
  return migrationSql`
    select
      id,
      email,
      password_hash,
      is_active,
      last_login_at
    from admins
    order by email
  `;
}

before(
  async () => {
    await assertTestDatabase();
  },
);

beforeEach(
  async () => {
    await cleanupAdminState();
  },
);

afterEach(
  async () => {
    await cleanupAdminState();
  },
);

after(
  async () => {
    await migrationSql.end();

    if (
      originalRuntimeUrl ===
      undefined
    ) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL =
        originalRuntimeUrl;
    }

    if (
      originalMigrationUrl ===
      undefined
    ) {
      delete process.env
        .DATABASE_MIGRATION_URL;
    } else {
      process.env.DATABASE_MIGRATION_URL =
        originalMigrationUrl;
    }
  },
);

test(
  'first Admin bootstrap rejects invalid input without writing an Admin',
  async () => {
    assert.deepEqual(
      await createFirstAdmin({
        email:
          '   ',
        password:
          'BootstrapFixture_42!',
      }),
      {
        ok: false,
        reason:
          'invalid_email',
      },
    );

    assert.deepEqual(
      await createFirstAdmin({
        email:
          'bootstrap-invalid@example.test',
        password:
          '',
      }),
      {
        ok: false,
        reason:
          'invalid_password',
      },
    );

    assert.equal(
      (
        await getAdmins()
      ).length,
      0,
    );
  },
);

test(
  'first Admin bootstrap creates exactly one canonical active Admin and no MFA or session state',
  async () => {
    const password =
      'BootstrapFixture_42!';

    const result =
      await createFirstAdmin({
        email:
          '  Bootstrap.Success@Example.Test  ',
        password,
      });

    assert.equal(
      result.ok,
      true,
    );

    assert.equal(
      result.admin.email,
      'bootstrap.success@example.test',
    );

    const admins =
      await getAdmins();

    assert.equal(
      admins.length,
      1,
    );

    assert.equal(
      admins[0].email,
      'bootstrap.success@example.test',
    );

    assert.equal(
      admins[0].is_active,
      true,
    );

    assert.equal(
      admins[0].last_login_at,
      null,
    );

    assert.equal(
      await verifyPassword(
        password,
        admins[0].password_hash,
      ),
      true,
    );

    const [
      sessions,
      challenges,
      totp,
      recovery,
    ] =
      await Promise.all([
        migrationSql`
          select
            count(*)::integer
              as count
          from admin_sessions
        `,
        migrationSql`
          select
            count(*)::integer
              as count
          from admin_login_challenges
        `,
        migrationSql`
          select
            count(*)::integer
              as count
          from admin_totp_factors
        `,
        migrationSql`
          select
            count(*)::integer
              as count
          from admin_recovery_codes
        `,
      ]);

    assert.equal(
      Number(
        sessions[0].count,
      ),
      0,
    );

    assert.equal(
      Number(
        challenges[0].count,
      ),
      0,
    );

    assert.equal(
      Number(
        totp[0].count,
      ),
      0,
    );

    assert.equal(
      Number(
        recovery[0].count,
      ),
      0,
    );
  },
);

test(
  'first Admin bootstrap refuses a second Admin without replacing the first credential',
  async () => {
    const firstPassword =
      'BootstrapFixture_First42!';

    const secondPassword =
      'BootstrapFixture_Second42!';

    const first =
      await createFirstAdmin({
        email:
          'bootstrap-first@example.test',
        password:
          firstPassword,
      });

    assert.equal(
      first.ok,
      true,
    );

    const second =
      await createFirstAdmin({
        email:
          'bootstrap-second@example.test',
        password:
          secondPassword,
      });

    assert.deepEqual(
      second,
      {
        ok: false,
        reason:
          'admin_exists',
      },
    );

    const admins =
      await getAdmins();

    assert.equal(
      admins.length,
      1,
    );

    assert.equal(
      admins[0].email,
      'bootstrap-first@example.test',
    );

    assert.equal(
      await verifyPassword(
        firstPassword,
        admins[0].password_hash,
      ),
      true,
    );

    assert.equal(
      await verifyPassword(
        secondPassword,
        admins[0].password_hash,
      ),
      false,
    );
  },
);

test(
  'concurrent first-Admin bootstrap attempts have exactly one winner',
  async () => {
    const results =
      await Promise.all([
        createFirstAdmin({
          email:
            'bootstrap-race-a@example.test',
          password:
            'BootstrapFixture_A42!',
        }),
        createFirstAdmin({
          email:
            'bootstrap-race-b@example.test',
          password:
            'BootstrapFixture_B42!',
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
            'admin_exists',
      ).length,
      1,
    );

    assert.equal(
      (
        await getAdmins()
      ).length,
      1,
    );
  },
);
