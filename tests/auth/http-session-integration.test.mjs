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
    'TEST_DATABASE_URL is required for session HTTP integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for session HTTP integration tests.',
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
    GET,
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
      '../../src/pages/api/admin/auth/session.ts'
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
  'http-session-integration-password-hash';

const ownedAdminIds =
  new Set();
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

async function insertAdmin({
  email,
  isActive = true,
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
        ${isActive},
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

function createSessionContext({
  sessionToken,
  recorder =
    createCookieRecorder(
      sessionToken,
    ),
} = {}) {
  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/session',
        {
          method: 'GET',
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
async function assertInvalidSession(
  response,
) {
  assert.equal(
    response.status,
    401,
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
      ok: false,
      reason: 'invalid_session',
    },
  );
}

function assertNoCookieMutation(
  recorder,
) {
  assert.equal(
    recorder.setCalls.length,
    0,
  );

  assert.equal(
    recorder.deleteCalls.length,
    0,
  );
}
test(
  'valid admin session GET returns only public session metadata without touching before five minutes',
  async () => {
    const fixtureNow =
      new Date();

    const admin =
      await insertAdmin({
        email:
          'http-session-valid@example.test',

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

        authMethod:
          'recovery',

        now:
          fixtureNow,
      });

    const recorder =
      createCookieRecorder(
        sessionToken,
      );

    const response =
      await GET(
        createSessionContext({
          sessionToken,
          recorder,
        }),
      );

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

    const body =
      await response.json();

    assert.deepEqual(
      Object.keys(
        body,
      ).sort(),
      [
        'absoluteExpiresAt',
        'admin',
        'authMethod',
        'idleExpiresAt',
        'ok',
      ],
    );

    assert.equal(
      body.ok,
      true,
    );

    assert.deepEqual(
      body.admin,
      {
        id:
          admin.id,

        email:
          admin.email,
      },
    );

    assert.equal(
      body.authMethod,
      'recovery',
    );

    assert.equal(
      body.idleExpiresAt,
      record.idleExpiresAt
        .toISOString(),
    );

    assert.equal(
      body.absoluteExpiresAt,
      record.absoluteExpiresAt
        .toISOString(),
    );

    assert.equal(
      Object.hasOwn(
        body,
        'sessionId',
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        body,
        'sessionToken',
      ),
      false,
    );

    assertNoCookieMutation(
      recorder,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

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
  'admin session GET touches an active session once the five-minute interval has elapsed',
  async () => {
    const sessionCreatedAt =
      addMilliseconds(
        new Date(),
        -(5 * 60 * 1_000 + 2_000),
      );

    const admin =
      await insertAdmin({
        email:
          'http-session-touch@example.test',

        now:
          sessionCreatedAt,
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
          sessionCreatedAt,
      });

    const recorder =
      createCookieRecorder(
        sessionToken,
      );

    const beforeCall =
      new Date();

    const response =
      await GET(
        createSessionContext({
          sessionToken,
          recorder,
        }),
      );

    const afterCall =
      new Date();

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      body.authMethod,
      'totp',
    );

    assertNoCookieMutation(
      recorder,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(
      persisted.last_seen_at.getTime() >=
        beforeCall.getTime(),
    );

    assert.ok(
      persisted.last_seen_at.getTime() <=
        afterCall.getTime(),
    );

    assert.equal(
      persisted.idle_expires_at.getTime() -
        persisted.last_seen_at.getTime(),
      30 * 60 * 1_000,
    );

    assert.equal(
      persisted.absolute_expires_at.getTime(),
      record.absoluteExpiresAt.getTime(),
    );

    assert.equal(
      body.idleExpiresAt,
      persisted.idle_expires_at
        .toISOString(),
    );

    assert.equal(
      body.absoluteExpiresAt,
      record.absoluteExpiresAt.toISOString(),
    );

    assert.notEqual(
      persisted.last_seen_at.getTime(),
      record.lastSeenAt.getTime(),
    );

    assert.notEqual(
      persisted.idle_expires_at.getTime(),
      record.idleExpiresAt.getTime(),
    );

    assert.equal(
      persisted.revoked_at,
      null,
    );

    assert.equal(
      persisted.revocation_reason,
      null,
    );

    assert.ok(
      record.id,
    );
  },
);
test(
  'idle-expired admin session GET returns 401 clears the cookie and atomically persists idle_timeout revocation',
  async () => {
    const sessionCreatedAt =
      addMilliseconds(
        new Date(),
        -(30 * 60 * 1_000 + 2_000),
      );

    const admin =
      await insertAdmin({
        email:
          'http-session-idle-expired@example.test',

        now:
          sessionCreatedAt,
      });

    const {
      sessionToken,
      tokenHash,
    } =
      await insertSession({
        adminId:
          admin.id,

        now:
          sessionCreatedAt,
      });

    const recorder =
      createCookieRecorder(
        sessionToken,
      );

    const beforeCall =
      new Date();

    const response =
      await GET(
        createSessionContext({
          sessionToken,
          recorder,
        }),
      );

    const afterCall =
      new Date();

    await assertInvalidSession(
      response,
    );

    assertSessionCookieDeleted(
      recorder,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.equal(
      persisted.revocation_reason,
      'idle_timeout',
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
  'disabled-admin session GET returns 401 clears the cookie and atomically persists admin_disabled revocation',
  async () => {
    const fixtureNow =
      new Date();

    const admin =
      await insertAdmin({
        email:
          'http-session-disabled@example.test',

        isActive:
          false,

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

    const recorder =
      createCookieRecorder(
        sessionToken,
      );

    const beforeCall =
      new Date();

    const response =
      await GET(
        createSessionContext({
          sessionToken,
          recorder,
        }),
      );

    const afterCall =
      new Date();

    await assertInvalidSession(
      response,
    );

    assertSessionCookieDeleted(
      recorder,
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.equal(
      persisted.revocation_reason,
      'admin_disabled',
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
  'unknown session credential returns 401 clears the cookie and creates no persisted session',
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
      await GET(
        createSessionContext({
          sessionToken:
            unknownToken,

          recorder,
        }),
      );

    await assertInvalidSession(
      response,
    );

    assertSessionCookieDeleted(
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