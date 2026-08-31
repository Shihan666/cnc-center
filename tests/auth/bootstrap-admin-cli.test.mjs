import assert from 'node:assert/strict';

import {
  spawn,
} from 'node:child_process';

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
    'TEST_DATABASE_URL is required for bootstrap CLI tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for bootstrap CLI tests.',
  );
}

if (
  testRuntimeUrl ===
  testMigrationUrl
) {
  throw new Error(
    'Bootstrap CLI test credentials must use separate roles.',
  );
}

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max: 1,
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

async function cleanup() {
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

function runCli({
  email,
  password,
}) {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const child =
        spawn(
          process.execPath,
          [
            './scripts/admin-bootstrap.mjs',
          ],
          {
            cwd:
              process.cwd(),

            env: {
              ...process.env,

              DATABASE_URL:
                testRuntimeUrl,

              DATABASE_MIGRATION_URL:
                testMigrationUrl,
            },

            stdio: [
              'pipe',
              'pipe',
              'pipe',
            ],
          },
        );

      let stdout =
        '';

      let stderr =
        '';

      child.stdout.setEncoding(
        'utf8',
      );

      child.stderr.setEncoding(
        'utf8',
      );

      child.stdout.on(
        'data',
        (chunk) => {
          stdout +=
            chunk;
        },
      );

      child.stderr.on(
        'data',
        (chunk) => {
          stderr +=
            chunk;
        },
      );

      child.once(
        'error',
        reject,
      );

      child.once(
        'close',
        (code) => {
          resolve({
            code,
            stdout,
            stderr,
          });
        },
      );

      child.stdin.end(
        `${email}\n${password}\n`,
      );
    },
  );
}

before(
  async () => {
    await assertTestDatabase();
  },
);

beforeEach(
  async () => {
    await cleanup();
  },
);

afterEach(
  async () => {
    await cleanup();
  },
);

after(
  async () => {
    await migrationSql.end();
  },
);

test(
  'pipe-only bootstrap creates the first Admin without printing the supplied password',
  async () => {
    const password =
      'BootstrapPipeFixture_42!';

    const result =
      await runCli({
        email:
          'bootstrap-pipe@example.test',
        password,
      });

    assert.equal(
      result.code,
      0,
    );

    assert.match(
      result.stdout,
      /Admin created\./u,
    );

    assert.equal(
      result.stdout.includes(
        password,
      ),
      false,
    );

    assert.equal(
      result.stderr.includes(
        password,
      ),
      false,
    );

    const rows =
      await migrationSql`
        select
          email
        from admins
      `;

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      rows[0]?.email,
      'bootstrap-pipe@example.test',
    );
  },
);

test(
  'pipe-only bootstrap refuses a second Admin and still never prints the supplied password',
  async () => {
    const first =
      await runCli({
        email:
          'bootstrap-pipe-first@example.test',
        password:
          'BootstrapPipeFirst_42!',
      });

    assert.equal(
      first.code,
      0,
    );

    const secondPassword =
      'BootstrapPipeSecond_42!';

    const second =
      await runCli({
        email:
          'bootstrap-pipe-second@example.test',
        password:
          secondPassword,
      });

    assert.equal(
      second.code,
      1,
    );

    assert.match(
      second.stderr,
      /already exists/u,
    );

    assert.equal(
      second.stdout.includes(
        secondPassword,
      ),
      false,
    );

    assert.equal(
      second.stderr.includes(
        secondPassword,
      ),
      false,
    );

    const [count] =
      await migrationSql`
        select
          count(*)::integer
            as count
        from admins
      `;

    assert.equal(
      Number(
        count.count,
      ),
      1,
    );
  },
);
