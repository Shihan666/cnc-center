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
    'TEST_DATABASE_URL is required for middleware integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for middleware integration tests.',
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
    onRequest,
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
      '../../src/middleware.ts'
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

const TEST_PASSWORD_HASH =
  'middleware-integration-password-hash';

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
  isActive = true,
  now = new Date(),
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

  assert.ok(row);

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
  now = new Date(),
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

function createMiddlewareContext({
  pathname = '/admin',
  recorder,
} = {}) {
  const context = {
    url:
      new URL(
        `http://localhost:4321${pathname}`,
      ),

    request:
      new Request(
        `http://localhost:4321${pathname}`,
      ),

    cookies:
      recorder.cookies,

    site:
      new URL(
        'http://localhost:4321',
      ),

    locals: {},

    redirect(
      path,
      status = 302,
    ) {
      return new Response(
        null,
        {
          status,

          headers: {
            Location:
              path,
          },
        },
      );
    },
  };

  return context;
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
      delete
      from admin_sessions
      where admin_id =
        ${adminId}
    `;

    await migrationSql`
      delete
      from admins
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

test(
  'valid protected admin session exposes only the locked safe locals view',
  async () => {
    const fixtureNow =
      new Date();

    const admin =
      await insertAdmin({
        email:
          'middleware-valid@example.test',

        now:
          fixtureNow,
      });

    const {
      sessionToken,
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

    const context =
      createMiddlewareContext({
        pathname:
          '/admin/orders',

        recorder,
      });

    let nextCalls = 0;

    const response =
      await onRequest(
        context,
        async () => {
          nextCalls += 1;

          return new Response(
            'admin',
            {
              status: 200,

              headers: {
                'Cache-Control':
                  'public, max-age=60',
              },
            },
          );
        },
      );

    assert.equal(
      nextCalls,
      1,
    );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'private, no-store',
    );

    assert.equal(
      response.headers.get(
        'x-robots-tag',
      ),
      'noindex, nofollow',
    );

    assert.deepEqual(
      recorder.getCalls,
      [
        'cnc_admin_session',
      ],
    );

    assert.equal(
      recorder.setCalls.length,
      0,
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    assert.deepEqual(
      Object.keys(
        context.locals,
      ),
      [
        'adminSession',
      ],
    );

    const safeSession =
      context.locals.adminSession;

    assert.ok(
      safeSession,
    );

    assert.deepEqual(
      Object.keys(
        safeSession,
      ).sort(),
      [
        'absoluteExpiresAt',
        'admin',
        'authMethod',
        'idleExpiresAt',
      ],
    );

    assert.deepEqual(
      safeSession.admin,
      {
        id:
          admin.id,

        email:
          admin.email,
      },
    );

    assert.equal(
      safeSession.authMethod,
      'recovery',
    );

    assert.deepEqual(
      safeSession.idleExpiresAt,
      record.idleExpiresAt,
    );

    assert.deepEqual(
      safeSession.absoluteExpiresAt,
      record.absoluteExpiresAt,
    );

    for (
      const forbiddenKey of [
        'sessionId',
        'sessionToken',
        'challengeToken',
        'createdAt',
        'lastSeenAt',
      ]
    ) {
      assert.equal(
        Object.hasOwn(
          safeSession,
          forbiddenKey,
        ),
        false,
      );
    }
  },
);

test(
  'idle-expired protected admin session is revoked by the auth service then redirected with no locals leak',
  async () => {
    const sessionCreatedAt =
      new Date(
        Date.now() -
          (
            30 * 60 * 1_000 +
            2_000
          ),
      );

    const admin =
      await insertAdmin({
        email:
          'middleware-idle-expired@example.test',

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

    const context =
      createMiddlewareContext({
        pathname:
          '/admin',

        recorder,
      });

    let nextCalls = 0;

    const beforeCall =
      new Date();

    const response =
      await onRequest(
        context,
        async () => {
          nextCalls += 1;

          return new Response(
            'must-not-run',
          );
        },
      );

    const afterCall =
      new Date();

    assert.equal(
      nextCalls,
      0,
    );

    assert.equal(
      response.status,
      302,
    );

    assert.equal(
      response.headers.get(
        'location',
      ),
      '/admin/auth/login',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'private, no-store',
    );

    assert.equal(
      response.headers.get(
        'x-robots-tag',
      ),
      'noindex, nofollow',
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

    assert.deepEqual(
      context.locals,
      {},
    );

    const persisted =
      await readSession(
        tokenHash,
      );

    assert.ok(
      persisted,
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
