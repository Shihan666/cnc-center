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

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for logout HTTP integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for logout HTTP integration tests.',
  );
}

const originalDatabaseUrl =
  process.env.DATABASE_URL;

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
    POST,
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
      '../../src/pages/api/admin/auth/logout.ts'
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
    '2026-08-30T02:00:00.000Z',
  );

const TEST_PASSWORD_HASH =
  'http-logout-integration-password-hash';

const ownedAdminIds =
  new Set();
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

async function insertAdmin({
  email,
  now = BASE_TIME,
}) {
  const [row] =
    await migrationSql`
      insert into admins (
        email,
        password_hash,
        is_active,
        password_changed_at,
        created_at,
        updated_at
      )
      values (
        ${email},
        ${TEST_PASSWORD_HASH},
        true,
        ${now},
        ${now},
        ${now}
      )
      returning
        id,
        email
    `;

  assert.ok(
    row,
  );

  ownedAdminIds.add(
    row.id,
  );

  return row;
}

async function insertSession({
  adminId,
  authMethod = 'totp',
  sessionToken =
    generateOpaqueAuthToken(),
  now = BASE_TIME,
}) {
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
          adminId,
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
  const [row] =
    await migrationSql`
      select
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
      from admin_sessions
      where token_hash =
        ${tokenHash}
      limit 1
    `;

  return row ?? null;
}
function createCookieRecorder(
  sessionToken,
) {
  const getCalls = [];
  const setCalls = [];
  const deleteCalls = [];

  return {
    getCalls,
    setCalls,
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        getCalls.push(
          name,
        );

        assert.equal(
          name,
          'cnc_admin_session',
        );

        if (
          sessionToken ===
          undefined
        ) {
          return undefined;
        }

        return {
          value:
            sessionToken,
        };
      },

      set(
        name,
        value,
        options,
      ) {
        setCalls.push({
          name,
          value,
          options,
        });
      },

      delete(
        name,
        options,
      ) {
        deleteCalls.push({
          name,
          options,
        });
      },
    },
  };
}

function createLogoutContext({
  sessionToken,
  recorder =
    createCookieRecorder(
      sessionToken,
    ),
} = {}) {
  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/logout',
        {
          method: 'POST',

          headers: {
            origin:
              'http://localhost:4321',

            'content-type':
              'application/json',
          },

          body:
            '{}',
        },
      ),

    cookies:
      recorder.cookies,

    site:
      new URL(
        'http://localhost:4321',
      ),
  };
}

function assertSessionCookieDeleted(
  recorder,
) {
  assert.deepEqual(
    recorder.deleteCalls,
    [
      {
        name:
          'cnc_admin_session',

        options: {
          httpOnly: true,
          sameSite: 'strict',
          secure: false,
          path: '/',
        },
      },
    ],
  );

  assert.equal(
    recorder.setCalls.length,
    0,
  );
}
async function cleanupOwnedRows() {
  for (
    const adminId of
    ownedAdminIds
  ) {
    await migrationSql`
      delete from admin_sessions
      where admin_id =
        ${adminId}
    `;

    await migrationSql`
      delete from admins
      where id =
        ${adminId}
    `;
  }

  ownedAdminIds.clear();
}

before(
  async () => {
    await assertTestDatabase();
  },
);

afterEach(
  async () => {
    await cleanupOwnedRows();
  },
);

after(
  async () => {
    try {
      await cleanupOwnedRows();
      await closeDatabase();

      await migrationSql.end({
        timeout: 5,
      });
    } finally {
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
async function assertSuccessfulLogout(
  response,
  recorder,
) {
  assert.equal(
    response.status,
    200,
  );

  assert.equal(
    response.headers.get(
      'cache-control',
    ),
    'no-store',
  );

  assert.equal(
    response.headers.get(
      'content-type',
    ),
    'application/json; charset=utf-8',
  );

  assert.deepEqual(
    await response.json(),
    {
      ok: true,
    },
  );

  assert.deepEqual(
    recorder.getCalls,
    [
      'cnc_admin_session',
    ],
  );

  assertSessionCookieDeleted(
    recorder,
  );
}

async function preRevokeSession({
  sessionId,
  revokedAt,
  reason,
}) {
  const revoked =
    await runAuthTransaction(
      (tx) =>
        tx.revokeAdminSession(
          sessionId,
          revokedAt,
          reason,
        ),
    );

  assert.equal(
    revoked,
    true,
  );
}
test(
  'active admin session logout returns 200 clears the credential and atomically revokes the session with logout',
  async () => {
    const fixtureNow =
      new Date();

    const admin =
      await insertAdmin({
        email:
          'http-logout-active@example.test',

        now:
          fixtureNow,
      });

    const {
      sessionToken,
      tokenHash,
    } =
      await insertSession({
        adminId:
          admin.id,

        authMethod:
          'recovery',

        now:
          fixtureNow,
      });

    const recorder =
      createCookieRecorder(
        sessionToken,
      );

    const beforeCall =
      new Date();

    const response =
      await POST(
        createLogoutContext({
          sessionToken,
          recorder,
        }),
      );

    const afterCall =
      new Date();

    await assertSuccessfulLogout(
      response,
      recorder,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(
      persisted,
    );

    assert.equal(
      persisted.auth_method,
      'recovery',
    );

    assert.equal(
      persisted.revocation_reason,
      'logout',
    );

    assert.ok(
      persisted.revoked_at,
    );

    assert.ok(
      persisted.revoked_at.getTime() >=
        beforeCall.getTime(),
    );

    assert.ok(
      persisted.revoked_at.getTime() <=
        afterCall.getTime(),
    );
  },
);
test(
  'replaying logout for the same session remains 200 and preserves the first logout revocation timestamp',
  async () => {
    const fixtureNow =
      new Date();

    const admin =
      await insertAdmin({
        email:
          'http-logout-replay@example.test',

        now:
          fixtureNow,
      });

    const {
      sessionToken,
      tokenHash,
    } =
      await insertSession({
        adminId:
          admin.id,

        now:
          fixtureNow,
      });

    const firstRecorder =
      createCookieRecorder(
        sessionToken,
      );

    const firstResponse =
      await POST(
        createLogoutContext({
          sessionToken,

          recorder:
            firstRecorder,
        }),
      );

    await assertSuccessfulLogout(
      firstResponse,
      firstRecorder,
    );

    const afterFirst =
      await readSession(
        tokenHash,
      );

    assert.ok(
      afterFirst?.revoked_at,
    );

    assert.equal(
      afterFirst.revocation_reason,
      'logout',
    );

    const firstRevokedAt =
      afterFirst.revoked_at;

    const secondRecorder =
      createCookieRecorder(
        sessionToken,
      );

    const secondResponse =
      await POST(
        createLogoutContext({
          sessionToken,

          recorder:
            secondRecorder,
        }),
      );

    await assertSuccessfulLogout(
      secondResponse,
      secondRecorder,
    );

    const afterSecond =
      await readSession(
        tokenHash,
      );

    assert.ok(
      afterSecond?.revoked_at,
    );

    assert.equal(
      afterSecond.revocation_reason,
      'logout',
    );

    assert.deepEqual(
      afterSecond.revoked_at,
      firstRevokedAt,
    );
  },
);
test(
  'logout for an already-revoked session returns 200 and preserves the original terminal reason and timestamp',
  async () => {
    const fixtureNow =
      new Date();

    const admin =
      await insertAdmin({
        email:
          'http-logout-terminal@example.test',

        now:
          fixtureNow,
      });

    const {
      sessionToken,
      tokenHash,
      record,
    } =
      await insertSession({
        adminId:
          admin.id,

        now:
          fixtureNow,
      });

    const originalRevokedAt =
      new Date(
        fixtureNow.getTime() +
          1_000,
      );

    await preRevokeSession({
      sessionId:
        record.id,

      revokedAt:
        originalRevokedAt,

      reason:
        'admin_disabled',
    });

    const beforeLogout =
      await readSession(
        tokenHash,
      );

    assert.deepEqual(
      beforeLogout.revoked_at,
      originalRevokedAt,
    );

    assert.equal(
      beforeLogout.revocation_reason,
      'admin_disabled',
    );

    const recorder =
      createCookieRecorder(
        sessionToken,
      );

    const response =
      await POST(
        createLogoutContext({
          sessionToken,
          recorder,
        }),
      );

    await assertSuccessfulLogout(
      response,
      recorder,
    );

    const afterLogout =
      await readSession(
        tokenHash,
      );

    assert.deepEqual(
      afterLogout.revoked_at,
      originalRevokedAt,
    );

    assert.equal(
      afterLogout.revocation_reason,
      'admin_disabled',
    );
  },
);
test(
  'unknown session credential logout returns 200 clears the cookie and creates no persisted session',
  async () => {
    const unknownToken =
      generateOpaqueAuthToken();

    const unknownHash =
      hashOpaqueAuthToken(
        unknownToken,
      );

    const recorder =
      createCookieRecorder(
        unknownToken,
      );

    const response =
      await POST(
        createLogoutContext({
          sessionToken:
            unknownToken,

          recorder,
        }),
      );

    await assertSuccessfulLogout(
      response,
      recorder,
    );

    const persisted =
      await readSession(
        unknownHash,
      );

    assert.equal(
      persisted,
      null,
    );
  },
);