import assert from 'node:assert/strict';

import {
  randomUUID,
} from 'node:crypto';

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
    'TEST_DATABASE_URL is required for dashboard API integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for dashboard API integration tests.',
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
  {
    GET:
      getDashboard,
  },
] =
  await Promise.all([
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
    import(
      '../../src/pages/api/admin/dashboard/index.ts'
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

async function insertAdmin() {
  const id =
    randomUUID();

  const now =
    new Date();

  const email =
    `b18-dashboard-api-${id}@example.test`;

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
      ${id},
      ${email},
      ${'b18-dashboard-api-test-password-hash'},
      ${true},
      ${now},
      ${now},
      ${now}
    )
  `;

  ownedAdminIds.add(
    id,
  );

  return {
    id,
    email,
  };
}

async function createValidAdminSession() {
  const admin =
    await insertAdmin();

  const sessionToken =
    generateOpaqueAuthToken();

  const tokenHash =
    hashOpaqueAuthToken(
      sessionToken,
    );

  const timing =
    createAdminSessionTiming(
      new Date(),
    );

  await runAuthTransaction(
    (tx) =>
      tx.insertAdminSession({
        adminId:
          admin.id,

        tokenHash,

        authMethod:
          'totp',

        timing,
      }),
  );

  return {
    admin,
    sessionToken,
  };
}

function createCookies(
  sessionToken,
) {
  const deleteCalls = [];

  return {
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
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

      set() {
        throw new Error(
          'Unexpected cookie set.',
        );
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

function createContext({
  sessionToken,
  site =
    new URL(
      'http://localhost:4321',
    ),
}) {
  const recorder =
    createCookies(
      sessionToken,
    );

  const url =
    new URL(
      'http://localhost:4321/api/admin/dashboard',
    );

  return {
    recorder,

    context: {
      url,

      request:
        new Request(
          url,
          {
            method:
              'GET',
          },
        ),

      cookies:
        recorder.cookies,

      site,

      params: {},
      locals: {},
    },
  };
}

function createStrictNoAccessCookies() {
  return {
    get() {
      throw new Error(
        'Cookie get must not run when site configuration is missing.',
      );
    },

    set() {
      throw new Error(
        'Cookie set must not run when site configuration is missing.',
      );
    },

    delete() {
      throw new Error(
        'Cookie delete must not run when site configuration is missing.',
      );
    },
  };
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
  'dashboard API requires an admin session and clears a missing session cookie',
  async () => {
    const {
      context,
      recorder,
    } =
      createContext({
        sessionToken:
          undefined,
      });

    const response =
      await getDashboard(
        context,
      );

    assert.equal(
      response.status,
      401,
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'invalid_session',
      },
    );

    assert.equal(
      recorder.deleteCalls.length,
      1,
    );

    assert.equal(
      recorder.deleteCalls[0].name,
      'cnc_admin_session',
    );
  },
);

test(
  'dashboard API returns the authoritative read-only dashboard snapshot for a valid admin session',
  async () => {
    const {
      sessionToken,
    } =
      await createValidAdminSession();

    const {
      context,
      recorder,
    } =
      createContext({
        sessionToken,
      });

    const response =
      await getDashboard(
        context,
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.deepEqual(
      Object.keys(
        body.dashboard,
      ).sort(),
      [
        'actions',
        'recentOrders',
        'today',
      ],
    );

    assert.deepEqual(
      Object.keys(
        body.dashboard.actions,
      ).sort(),
      [
        'needsProcessing',
        'outOfStock',
        'readyToShip',
      ],
    );

    assert.deepEqual(
      Object.keys(
        body.dashboard.today,
      ).sort(),
      [
        'newOrders',
        'readyToShip',
        'shipped',
      ],
    );

    assert.equal(
      Number.isInteger(
        body.dashboard.actions
          .readyToShip,
      ),
      true,
    );

    assert.equal(
      Number.isInteger(
        body.dashboard.actions
          .needsProcessing,
      ),
      true,
    );

    assert.equal(
      Number.isInteger(
        body.dashboard.actions
          .outOfStock,
      ),
      true,
    );

    assert.equal(
      Number.isInteger(
        body.dashboard.today
          .newOrders,
      ),
      true,
    );

    assert.equal(
      Number.isInteger(
        body.dashboard.today
          .readyToShip,
      ),
      true,
    );

    assert.equal(
      Number.isInteger(
        body.dashboard.today
          .shipped,
      ),
      true,
    );

    assert.equal(
      Array.isArray(
        body.dashboard
          .recentOrders,
      ),
      true,
    );

    assert.ok(
      body.dashboard
        .recentOrders.length <= 5,
    );

    for (
      const order of
      body.dashboard.recentOrders
    ) {
      assert.deepEqual(
        Object.keys(
          order,
        ).sort(),
        [
          'createdAt',
          'currency',
          'customerName',
          'id',
          'orderNumber',
          'status',
          'totalRial',
        ],
      );

      assert.equal(
        Object.hasOwn(
          order,
          'customerPhone',
        ),
        false,
      );

      assert.equal(
        Object.hasOwn(
          order,
          'customerAddress',
        ),
        false,
      );

      assert.equal(
        Object.hasOwn(
          order,
          'customerNotes',
        ),
        false,
      );
    }
  },
);

test(
  'dashboard API fails closed with a generic server error when admin API authentication cannot initialize',
  async () => {
    const url =
      new URL(
        'http://localhost:4321/api/admin/dashboard',
      );

    const response =
      await getDashboard({
        url,

        request:
          new Request(
            url,
            {
              method:
                'GET',
            },
          ),

        cookies:
          createStrictNoAccessCookies(),

        site:
          null,

        params: {},
        locals: {},
      });

    assert.equal(
      response.status,
      500,
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'server_error',
      },
    );
  },
);
