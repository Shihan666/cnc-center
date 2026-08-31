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
    'TEST_DATABASE_URL is required for orders API integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for orders API integration tests.',
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
      getOrdersList,
  },
  {
    GET:
      getOrderDetail,
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
      '../../src/pages/api/admin/orders/index.ts'
    ),
    import(
      '../../src/pages/api/admin/orders/[id].ts'
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

const ownedOrderIds =
  new Set();

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
    `b10-orders-api-${id}@example.test`;

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
      ${'b10-orders-api-test-password-hash'},
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

async function insertOrder({
  status = 'pending',
  customerName,
  customerPhone,
  totalRial = 1_000_000,
}) {
  const orderNumber =
    `B10-API-${randomUUID()}`;

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
        ${orderNumber},
        ${status},
        ${customerName},
        ${customerPhone},
        ${'Tehran'},
        ${'Test address'},
        ${''},
        ${'pickup'},
        ${'Pickup'},
        ${totalRial},
        ${0},
        ${totalRial},
        ${'IRR'},
        ${false},
        ${now},
        ${now}
      )
      returning
        id,
        order_number
    `;

  assert.ok(row);

  ownedOrderIds.add(
    row.id,
  );

  return row;
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
  pathname,
  sessionToken,
  params = {},
}) {
  const recorder =
    createCookies(
      sessionToken,
    );

  const url =
    new URL(
      `http://localhost:4321${pathname}`,
    );

  return {
    recorder,

    context: {
      url,

      request:
        new Request(
          url,
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

      params,
      locals: {},
    },
  };
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
      from payments
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from inventory_reservations
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from order_items
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

  ownedOrderIds.clear();

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

    await migrationSql`
      delete
      from order_status_history
      where order_id in (
        select id
        from orders
        where order_number like 'B10-API-%'
      )
    `;

    await migrationSql`
      delete
      from payments
      where order_id in (
        select id
        from orders
        where order_number like 'B10-API-%'
      )
    `;

    await migrationSql`
      delete
      from inventory_reservations
      where order_id in (
        select id
        from orders
        where order_number like 'B10-API-%'
      )
    `;

    await migrationSql`
      delete
      from order_items
      where order_id in (
        select id
        from orders
        where order_number like 'B10-API-%'
      )
    `;

    await migrationSql`
      delete
      from orders
      where order_number like 'B10-API-%'
    `;
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
  'orders list API requires an admin session and clears a missing session cookie',
  async () => {
    const {
      context,
      recorder,
    } =
      createContext({
        pathname:
          '/api/admin/orders',
        sessionToken:
          undefined,
      });

    const response =
      await getOrdersList(
        context,
      );

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
  'orders list API returns real filtered pagination data for a valid admin session',
  async () => {
    const {
      sessionToken,
    } =
      await createValidAdminSession();

    const paid =
      await insertOrder({
        status: 'paid',
        customerName:
          'API Customer Unique',
        customerPhone:
          '09121110001',
        totalRial:
          2_000_000,
      });

    await insertOrder({
      status: 'pending',
      customerName:
        'API Customer',
      customerPhone:
        '09121110002',
      totalRial:
        3_000_000,
    });

    const {
      context,
      recorder,
    } =
      createContext({
        pathname:
          '/api/admin/orders?q=%20API%20Customer%20Unique%20&status=paid&page=1&pageSize=10',

        sessionToken,
      });

    const response =
      await getOrdersList(
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

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.deepEqual(
      body.query,
      {
        q:
          'API Customer Unique',
        status:
          'paid',
        page:
          1,
        pageSize:
          10,
      },
    );
assert.equal(
      body.pagination.total,
      1,
    );

    assert.equal(
      body.pagination.page,
      1,
    );

    assert.equal(
      body.pagination.pageSize,
      10,
    );

    assert.equal(
      body.pagination.totalPages,
      1,
    );

    assert.equal(
      body.orders.length,
      1,
    );

    assert.equal(
      body.orders[0].id,
      paid.id,
    );

    assert.equal(
      body.orders[0].status,
      'paid',
    );

    assert.equal(
      body.orders[0].totalRial,
      2_000_000,
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    assert.equal(
      JSON.stringify(
        body,
      ).includes(
        sessionToken,
      ),
      false,
    );
  },
);

test(
  'order detail API returns authoritative detail and treats malformed ids as not found',
  async () => {
    const {
      sessionToken,
    } =
      await createValidAdminSession();

    const order =
      await insertOrder({
        status:
          'processing',
        customerName:
          'Detail API Customer',
        customerPhone:
          '09121110003',
        totalRial:
          4_000_000,
      });

    const validContext =
      createContext({
        pathname:
          `/api/admin/orders/${order.id}`,

        sessionToken,

        params: {
          id:
            order.id,
        },
      }).context;

    const validResponse =
      await getOrderDetail(
        validContext,
      );

    assert.equal(
      validResponse.status,
      200,
    );

    assert.equal(
      validResponse.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const validBody =
      await validResponse.json();

    assert.equal(
      validBody.ok,
      true,
    );

    assert.equal(
      validBody.order.id,
      order.id,
    );

    assert.equal(
      validBody.order.status,
      'processing',
    );

    assert.equal(
      validBody.order.totalRial,
      4_000_000,
    );

    assert.deepEqual(
      validBody.order.items,
      [],
    );

    assert.deepEqual(
      validBody.order.payments,
      [],
    );

    assert.deepEqual(
      validBody.order.statusHistory,
      [],
    );

    assert.equal(
      JSON.stringify(
        validBody,
      ).includes(
        sessionToken,
      ),
      false,
    );

    const malformedContext =
      createContext({
        pathname:
          '/api/admin/orders/not-a-uuid',

        sessionToken,

        params: {
          id:
            'not-a-uuid',
        },
      }).context;

    const malformedResponse =
      await getOrderDetail(
        malformedContext,
      );

    assert.equal(
      malformedResponse.status,
      404,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'not_found',
      },
    );
  },
);