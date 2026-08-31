import assert from 'node:assert/strict';

import {
  after,
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

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for order status API tests.',
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
  statusModule,
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
      '../../src/pages/api/admin/orders/[id]/status.ts'
    ),
  ]);

const POST =
  statusModule.POST;

const migrationSql =
  postgres(
    testDatabaseUrl,
    {
      max: 2,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const ownedAdminIds =
  new Set();

const ownedOrderIds =
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
  const now =
    new Date();

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
        ${`status-api-${crypto.randomUUID()}@test.local`},
        ${'status-api-test-password-hash'},
        ${true},
        ${now},
        ${now},
        ${now}
      )
      returning
        id
    `;

  assert.ok(row);

  ownedAdminIds.add(
    row.id,
  );

  return row.id;
}

async function insertSession(
  adminId,
) {
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
        adminId,
        tokenHash,
        authMethod:
          'totp',
        timing,
      }),
  );

  return sessionToken;
}

async function insertOrder() {
  const now =
    new Date();

  const [row] =
    await migrationSql`
      insert into orders (
        order_number,
        status,
        customer_name,
        customer_phone,
        customer_city,
        customer_address,
        customer_notes,
        shipping_method_id,
        shipping_method_label,
        subtotal_rial,
        shipping_fee_rial,
        total_rial,
        currency,
        payment_ready,
        created_at,
        updated_at
      )
      values (
        ${`B10-STATUS-${crypto.randomUUID()}`},
        ${'paid'},
        ${'Status API Customer'},
        ${'09120000000'},
        ${'Tehran'},
        ${'Test address'},
        ${''},
        ${'pickup'},
        ${'Test pickup'},
        ${1_000_000},
        ${0},
        ${1_000_000},
        ${'IRR'},
        ${true},
        ${now},
        ${now}
      )
      returning
        id
    `;

  assert.ok(row);

  ownedOrderIds.add(
    row.id,
  );

  return row.id;
}

async function cleanupOwnedRows() {
  for (
    const orderId of
    ownedOrderIds
  ) {
    await migrationSql`
      delete
      from order_status_history
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from orders
      where id =
        ${orderId}
    `;
  }

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

  ownedOrderIds.clear();
  ownedAdminIds.clear();
}

function createContext({
  orderId,
  sessionToken,
  body,
}) {
  const cookies = {
    get(
      name,
    ) {
      assert.equal(
        name,
        'cnc_admin_session',
      );

      return sessionToken ===
        undefined
        ? undefined
        : {
            value:
              sessionToken,
          };
    },

    delete() {},
  };

  return {
    request:
      new Request(
        `http://localhost:4321/api/admin/orders/${orderId}/status`,
        {
          method:
            'POST',

          headers: {
            'content-type':
              'application/json',

            origin:
              'http://localhost:4321',
          },

          body:
            body === undefined
              ? undefined
              : JSON.stringify(
                  body,
                ),
        },
      ),

    params: {
      id:
        orderId,
    },

    site:
      new URL(
        'http://localhost:4321',
      ),

    cookies,
  };
}

before(
  async () => {
    await assertTestDatabase();
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
  'order status API rejects an unauthenticated request',
  async () => {
    const orderId =
      await insertOrder();

    const response =
      await POST(
        createContext({
          orderId,

          sessionToken:
            undefined,

          body: {
            toStatus:
              'processing',
          },
        }),
      );

    assert.equal(
      response.status,
      401,
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'invalid_session',
      },
    );
  },
);

test(
  'order status API changes a paid order to processing with a real admin session',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const orderId =
      await insertOrder();

    const response =
      await POST(
        createContext({
          orderId,

          sessionToken,

          body: {
            toStatus:
              'processing',

            reason:
              'Processing started',
          },
        }),
      );

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
      body.transition.orderId,
      orderId,
    );

    assert.equal(
      body.transition.fromStatus,
      'paid',
    );

    assert.equal(
      body.transition.toStatus,
      'processing',
    );
  },
);

test(
  'order status API rejects an invalid transition',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const orderId =
      await insertOrder();

    const response =
      await POST(
        createContext({
          orderId,

          sessionToken,

          body: {
            toStatus:
              'shipped',

            reason:
              'Invalid skip',
          },
        }),
      );

    assert.equal(
      response.status,
      409,
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,

        reason:
          'invalid_transition',

        fromStatus:
          'paid',

        toStatus:
          'shipped',
      },
    );
  },
);

test(
  'order status API rejects malformed order ids',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const response =
      await POST(
        createContext({
          orderId:
            'not-a-uuid',

          sessionToken,

          body: {
            toStatus:
              'processing',
          },
        }),
      );

    assert.equal(
      response.status,
      404,
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,

        reason:
          'not_found',
      },
    );
  },
);