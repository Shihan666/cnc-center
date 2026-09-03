import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  test,
} from 'node:test';

import {
  randomUUID,
} from 'node:crypto';

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
    'TEST_DATABASE_URL is required for customer repository integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for customer repository integration tests.',
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
    listAdminCustomers,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/customers/repository.ts'
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
        ${'Test pickup'},
        ${1_000_000},
        ${0},
        ${1_000_000},
        ${'IRR'},
        ${true},
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

async function cleanupOwnedRows() {
  for (
    const orderId of
    ownedOrderIds
  ) {
    await migrationSql`
      delete
      from orders
      where id =
        ${orderId}
    `;
  }

  ownedOrderIds.clear();
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
    await cleanupOwnedRows();

    await closeDatabase();

    await migrationSql.end({
      timeout: 5,
    });
  },
);

test(
  'customer repository groups orders by canonical phone and uses latest order profile',
  async () => {
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
        `B16-OLD-${suffix}`,

      customerName:
        'نام قدیمی مشتری',

      customerPhone:
        '09127770001',

      customerCity:
        'تهران',

      createdAt:
        olderAt,
    });

    const latestOrderId =
      await insertOrder({
        orderNumber:
          `B16-NEW-${suffix}`,

        customerName:
          'نام جدید مشتری',

        customerPhone:
          '09127770001',

        customerCity:
          'کرج',

        createdAt:
          latestAt,
      });

    const result =
      await listAdminCustomers({
        q:
          '09127770001',
        page:
          1,
        pageSize:
          25,
      });

    assert.equal(
      result.total,
      1,
    );

    assert.equal(
      result.items.length,
      1,
    );

    const customer =
      result.items[0];

    assert.equal(
      customer.customerPhone,
      '09127770001',
    );

    assert.equal(
      customer.customerName,
      'نام جدید مشتری',
    );

    assert.equal(
      customer.customerCity,
      'کرج',
    );

    assert.equal(
      customer.orderCount,
      2,
    );

    assert.equal(
      customer.latestOrderId,
      latestOrderId,
    );

    assert.equal(
      customer.latestOrderNumber,
      `B16-NEW-${suffix}`,
    );

    assert.equal(
      customer.latestOrderAt.getTime(),
      latestAt.getTime(),
    );
  },
);

test(
  'customer repository searches latest customer fields and treats wildcard characters literally',
  async () => {
    const suffix =
      randomUUID();

    await insertOrder({
      orderNumber:
        `B16-LITERAL-%-${suffix}`,

      customerName:
        'Literal Percent Customer',

      customerPhone:
        '09127770002',

      customerCity:
        'Qazvin',

      createdAt:
        new Date(
          '2026-09-02T10:00:00.000Z',
        ),
    });

    await insertOrder({
      orderNumber:
        `B16-LITERAL-X-${suffix}`,

      customerName:
        'Literal Decoy Customer',

      customerPhone:
        '09127770003',

      customerCity:
        'Qazvin',

      createdAt:
        new Date(
          '2026-09-02T11:00:00.000Z',
        ),
    });

    const result =
      await listAdminCustomers({
        q:
          `B16-LITERAL-%-${suffix}`,
        page:
          1,
        pageSize:
          25,
      });

    assert.equal(
      result.total,
      1,
    );

    assert.equal(
      result.items.length,
      1,
    );

    assert.equal(
      result.items[0].customerPhone,
      '09127770002',
    );
  },
);

test(
  'customer repository paginates distinct customers ordered by latest order',
  async () => {
    const suffix =
      randomUUID();

    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      await insertOrder({
        orderNumber:
          `B16-PAGE-${index}-${suffix}`,

        customerName:
          `Pagination Customer ${index}`,

        customerPhone:
          `0912888000${index}`,

        customerCity:
          'Tehran',

        createdAt:
          new Date(
            Date.UTC(
              2026,
              8,
              1 + index,
              12,
            ),
          ),
      });
    }

    const firstPage =
      await listAdminCustomers({
        q:
          `Pagination Customer`,
        page:
          1,
        pageSize:
          2,
      });

    assert.equal(
      firstPage.total,
      3,
    );

    assert.equal(
      firstPage.totalPages,
      2,
    );

    assert.equal(
      firstPage.items.length,
      2,
    );

    assert.equal(
      firstPage.items[0].customerPhone,
      '09128880002',
    );

    assert.equal(
      firstPage.items[1].customerPhone,
      '09128880001',
    );

    const secondPage =
      await listAdminCustomers({
        q:
          `Pagination Customer`,
        page:
          2,
        pageSize:
          2,
      });

    assert.equal(
      secondPage.items.length,
      1,
    );

    assert.equal(
      secondPage.items[0].customerPhone,
      '09128880000',
    );
  },
);