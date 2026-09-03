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
    'TEST_DATABASE_URL is required for customers API integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for customers API integration tests.',
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
      getCustomersList,
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
      '../../src/pages/api/admin/customers/index.ts'
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
    `b16-customers-api-${id}@example.test`;

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
      ${'b16-customers-api-test-password-hash'},
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
  orderNumber,
  customerName,
  customerPhone,
  customerCity,
  createdAt,
}) {
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
        ${'pending'},
        ${customerName},
        ${customerPhone},
        ${customerCity},
        ${'Test address'},
        ${''},
        ${'pickup'},
        ${'Pickup'},
        ${1_000_000},
        ${0},
        ${1_000_000},
        ${'IRR'},
        ${false},
        ${createdAt},
        ${createdAt}
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
            method:
              'GET',
          },
        ),

      cookies:
        recorder.cookies,

      site:
        new URL(
          'http://localhost:4321',
        ),

      params: {},

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
  'customers list API requires an admin session and clears a missing session cookie',
  async () => {
    const {
      context,
      recorder,
    } =
      createContext({
        pathname:
          '/api/admin/customers',

        sessionToken:
          undefined,
      });

    const response =
      await getCustomersList(
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
  'customers list API returns aggregated customer data for a valid admin session',
  async () => {
    const {
      sessionToken,
    } =
      await createValidAdminSession();

    const suffix =
      randomUUID();

    const olderAt =
      new Date(
        '2026-09-01T10:00:00.000Z',
      );

    const latestAt =
      new Date(
        '2026-09-03T10:00:00.000Z',
      );

    await insertOrder({
      orderNumber:
        `B16-CUSTOMERS-OLD-${suffix}`,

      customerName:
        'Customer Older',

      customerPhone:
        '09129990001',

      customerCity:
        'Tehran',

      createdAt:
        olderAt,
    });

    const latestOrderId =
      await insertOrder({
        orderNumber:
          `B16-CUSTOMERS-NEW-${suffix}`,

        customerName:
          'Customer Latest',

        customerPhone:
          '09129990001',

        customerCity:
          'Karaj',

        createdAt:
          latestAt,
      });

    await insertOrder({
      orderNumber:
        `B16-CUSTOMERS-DECOY-${suffix}`,

      customerName:
        'Other Customer',

      customerPhone:
        '09129990002',

      customerCity:
        'Tabriz',

      createdAt:
        new Date(
          '2026-09-02T10:00:00.000Z',
        ),
    });

    const {
      context,
      recorder,
    } =
      createContext({
        pathname:
          '/api/admin/customers?q=%20Customer%20Latest%20&page=1&pageSize=10',

        sessionToken,
      });

    const response =
      await getCustomersList(
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
      body.query,
      {
        q:
          'Customer Latest',

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
      body.customers.length,
      1,
    );

    assert.equal(
      body.customers[0].customerPhone,
      '09129990001',
    );

    assert.equal(
      body.customers[0].customerName,
      'Customer Latest',
    );

    assert.equal(
      body.customers[0].customerCity,
      'Karaj',
    );

    assert.equal(
      body.customers[0].orderCount,
      2,
    );

    assert.equal(
      body.customers[0].latestOrderId,
      latestOrderId,
    );

    assert.equal(
      body.customers[0].latestOrderNumber,
      `B16-CUSTOMERS-NEW-${suffix}`,
    );

    assert.equal(
      body.customers[0].latestOrderAt,
      latestAt.toISOString(),
    );
  },
);