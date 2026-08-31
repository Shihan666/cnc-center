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
    'TEST_DATABASE_URL is required for orders repository integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for orders repository integration tests.',
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
    getAdminOrderById,
    listAdminOrders,
    transitionAdminOrderStatus,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/orders/repository.ts'
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

const ownedProductIds =
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
  status = 'pending',
  customerName,
  customerPhone,
  customerCity,
  totalRial = 1_000_000,
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
        ${status},
        ${customerName},
        ${customerPhone},
        ${customerCity},
        ${'Test address'},
        ${''},
        ${'pickup'},
        ${'Test pickup'},
        ${totalRial},
        ${0},
        ${totalRial},
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

async function insertProduct() {
  const suffix =
    randomUUID();

  const [row] =
    await migrationSql`
      insert into products (
        content_id,
        part_number,
        name,
        brand,
        condition,
        commerce_mode,
        price_visibility,
        shipping_class,
        status
      )
      values (
        ${`b10-detail-${suffix}`},
        ${`B10-PART-${suffix}`},
        ${'B10 Detail Product'},
        ${'B10 Test Brand'},
        ${'new'},
        ${'direct-purchase'},
        ${'visible'},
        ${'standard'},
        ${'active'}
      )
      returning
        id
    `;

  assert.ok(row);

  ownedProductIds.add(
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
    const productId of
    ownedProductIds
  ) {
    await migrationSql`
      delete
      from products
      where id =
        ${productId}
    `;
  }

  ownedProductIds.clear();
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
  'admin orders repository filters by status and returns newest orders first',
  async () => {
    const base =
      Date.now();

    await insertOrder({
      orderNumber:
        'B10-REPO-OLD',
      status:
        'pending',
      customerName:
        'Older Customer',
      customerPhone:
        '09120000001',
      customerCity:
        'Tehran',
      createdAt:
        new Date(
          base - 60_000,
        ),
    });

    const newestId =
      await insertOrder({
        orderNumber:
          'B10-REPO-NEW',
        status:
          'paid',
        customerName:
          'Newest Customer',
        customerPhone:
          '09120000002',
        customerCity:
          'Karaj',
        createdAt:
          new Date(base),
      });

    const result =
      await listAdminOrders({
        q: '',
        status:
          'paid',
        page: 1,
        pageSize: 25,
      });

    assert.ok(
      result.items.some(
        (item) =>
          item.id === newestId,
      ),
    );

    assert.equal(
      result.items.some(
        (item) =>
          item.orderNumber ===
          'B10-REPO-OLD',
      ),
      false,
    );

    assert.equal(
      result.page,
      1,
    );

    assert.equal(
      result.pageSize,
      25,
    );

    assert.ok(
      result.total >= 1,
    );
  },
);

test(
  'admin orders repository searches canonical order fields',
  async () => {
    const createdAt =
      new Date();

    const orderId =
      await insertOrder({
        orderNumber:
          'B10-SEARCH-741',
        customerName:
          'Unique Search Customer',
        customerPhone:
          '09124445566',
        customerCity:
          'Qazvin',
        createdAt,
      });

    for (
      const q of [
        'B10-SEARCH-741',
        'Unique Search Customer',
        '09124445566',
        'Qazvin',
      ]
    ) {
      const result =
        await listAdminOrders({
          q,
          status: null,
          page: 1,
          pageSize: 25,
        });

      assert.ok(
        result.items.some(
          (item) =>
            item.id === orderId,
        ),
      );
    }
  },
);

test(
  'admin orders repository treats percent and underscore search characters literally',
  async () => {
    const suffix =
      randomUUID();

    const createdAt =
      new Date();

    const percentTarget =
      await insertOrder({
        orderNumber:
          `B10-LITERAL-%-${suffix}`,
        customerName:
          'Literal Percent Target',
        customerPhone:
          '09126660001',
        customerCity:
          'Tehran',
        createdAt,
      });

    await insertOrder({
      orderNumber:
        `B10-LITERAL-X-${suffix}`,
      customerName:
        'Literal Percent Decoy',
      customerPhone:
        '09126660002',
      customerCity:
        'Tehran',
      createdAt:
        new Date(
          createdAt.getTime() + 1,
        ),
    });

    const percentResult =
      await listAdminOrders({
        q:
          `B10-LITERAL-%-${suffix}`,
        status: null,
        page: 1,
        pageSize: 25,
      });

    assert.equal(
      percentResult.total,
      1,
    );

    assert.equal(
      percentResult.items.length,
      1,
    );

    assert.equal(
      percentResult.items[0].id,
      percentTarget,
    );

    const underscoreTarget =
      await insertOrder({
        orderNumber:
          `B10-LITERAL_-${suffix}`,
        customerName:
          'Literal Underscore Target',
        customerPhone:
          '09126660003',
        customerCity:
          'Tehran',
        createdAt:
          new Date(
            createdAt.getTime() + 2,
          ),
      });

    await insertOrder({
      orderNumber:
        `B10-LITERALZ-${suffix}`,
      customerName:
        'Literal Underscore Decoy',
      customerPhone:
        '09126660004',
      customerCity:
        'Tehran',
      createdAt:
        new Date(
          createdAt.getTime() + 3,
        ),
    });

    const underscoreResult =
      await listAdminOrders({
        q:
          `B10-LITERAL_-${suffix}`,
        status: null,
        page: 1,
        pageSize: 25,
      });

    assert.equal(
      underscoreResult.total,
      1,
    );

    assert.equal(
      underscoreResult.items.length,
      1,
    );

    assert.equal(
      underscoreResult.items[0].id,
      underscoreTarget,
    );
  },
);
test(
  'admin orders repository applies real pagination and count metadata',
  async () => {
    const base =
      Date.now();

    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      await insertOrder({
        orderNumber:
          `B10-PAGE-${index}`,
        customerName:
          `Pagination Customer ${index}`,
        customerPhone:
          `0912333000${index}`,
        customerCity:
          'Tehran',
        createdAt:
          new Date(
            base + index,
          ),
      });
    }

    const result =
      await listAdminOrders({
        q:
          'B10-PAGE-',
        status: null,
        page: 2,
        pageSize: 2,
      });

    assert.equal(
      result.total,
      3,
    );

    assert.equal(
      result.totalPages,
      2,
    );

    assert.equal(
      result.page,
      2,
    );

    assert.equal(
      result.pageSize,
      2,
    );

    assert.equal(
      result.items.length,
      1,
    );
  },
);
test(
  'admin orders repository transitions status atomically and appends status history',
  async () => {
    const order =
      await insertOrder({
        orderNumber:
          `B10-MUTATION-${randomUUID()}`,
        status:
          'paid',
        customerName:
          'Mutation Customer',
        customerPhone:
          '09121110005',
        customerCity:
          'Tehran',
        totalRial:
          5_000_000,
        createdAt:
          new Date(),
      });

    const changedAt =
      new Date();

    const result =
      await transitionAdminOrderStatus({
        orderId:
          order,

        toStatus:
          'processing',

        reason:
          'Processing started',

        changedAt,
      });

    assert.equal(
      result.status,
      'updated',
    );

    assert.equal(
      result.orderId,
      order,
    );

    assert.equal(
      result.fromStatus,
      'paid',
    );

    assert.equal(
      result.toStatus,
      'processing',
    );

    assert.equal(
      result.updatedAt.getTime(),
      changedAt.getTime(),
    );

    assert.ok(
      result.historyId,
    );

    assert.equal(
      result.historyCreatedAt.getTime(),
      changedAt.getTime(),
    );

    const detail =
      await getAdminOrderById(
        order,
      );

    assert.ok(detail);

    assert.equal(
      detail.status,
      'processing',
    );

    assert.equal(
      detail.paidAt,
      null,
    );

    assert.equal(
      detail.statusHistory.length,
      1,
    );

    assert.equal(
      detail.statusHistory[0].fromStatus,
      'paid',
    );

    assert.equal(
      detail.statusHistory[0].toStatus,
      'processing',
    );

    assert.equal(
      detail.statusHistory[0].reason,
      'Processing started',
    );

    const invalid =
      await transitionAdminOrderStatus({
        orderId:
          order,

        toStatus:
          'shipped',

        reason:
          'Invalid skip',

        changedAt:
          new Date(
            changedAt.getTime() + 1_000,
          ),
      });

    assert.deepEqual(
      invalid,
      {
        status:
          'invalid_transition',

        fromStatus:
          'processing',

        toStatus:
          'shipped',
      },
    );

    const unchanged =
      await getAdminOrderById(
        order,
      );

    assert.ok(unchanged);

    assert.equal(
      unchanged.status,
      'processing',
    );

    assert.equal(
      unchanged.statusHistory.length,
      1,
    );
  },
);

test(
  'admin orders repository rejects malformed and unknown order ids without opening a transaction',
  async () => {
    const malformed =
      await transitionAdminOrderStatus({
        orderId:
          'not-a-uuid',

        toStatus:
          'processing',

        reason:
          null,

        changedAt:
          new Date(),
      });

    assert.deepEqual(
      malformed,
      {
        status:
          'not_found',
      },
    );

    const unknown =
      await transitionAdminOrderStatus({
        orderId:
          randomUUID(),

        toStatus:
          'processing',

        reason:
          null,

        changedAt:
          new Date(),
      });

    assert.deepEqual(
      unknown,
      {
        status:
          'not_found',
      },
    );
  },
);
test(
  'admin orders repository returns authoritative order detail with items payments and status history',
  async () => {
    const suffix =
      randomUUID();

    const productId =
      await insertProduct();

    const createdAt =
      new Date();

    const orderId =
      await insertOrder({
        orderNumber:
          `B10-DETAIL-${suffix}`,
        status:
          'processing',
        customerName:
          'Detail Customer',
        customerPhone:
          '09125556677',
        customerCity:
          'Tehran',
        totalRial:
          2_500_000,
        createdAt,
      });

    const itemCreatedAt =
      new Date(
        createdAt.getTime() +
        1_000,
      );

    await migrationSql`
      insert into order_items (
        order_id,
        product_id,
        product_name,
        brand,
        part_number,
        quantity,
        unit_price_rial,
        line_total_rial,
        shipping_class,
        created_at
      )
      values (
        ${orderId},
        ${productId},
        ${'Snapshot Detail Product'},
        ${'Snapshot Brand'},
        ${'B10-SNAPSHOT-PART'},
        ${2},
        ${1_250_000},
        ${2_500_000},
        ${'standard'},
        ${itemCreatedAt}
      )
    `;

    const paymentCreatedAt =
      new Date(
        createdAt.getTime() +
        2_000,
      );

    await migrationSql`
      insert into payments (
        order_id,
        provider,
        environment,
        status,
        amount_rial,
        currency,
        ref_id,
        created_at,
        requested_at,
        verified_at
      )
      values (
        ${orderId},
        ${'zarinpal'},
        ${'sandbox'},
        ${'paid'},
        ${2_500_000},
        ${'IRR'},
        ${'B10-REF-DETAIL'},
        ${paymentCreatedAt},
        ${paymentCreatedAt},
        ${paymentCreatedAt}
      )
    `;

    const firstHistoryAt =
      new Date(
        createdAt.getTime() +
        3_000,
      );

    const secondHistoryAt =
      new Date(
        createdAt.getTime() +
        4_000,
      );

    await migrationSql`
      insert into order_status_history (
        order_id,
        from_status,
        to_status,
        reason,
        created_at
      )
      values
      (
        ${orderId},
        ${null},
        ${'paid'},
        ${'Payment verified'},
        ${firstHistoryAt}
      ),
      (
        ${orderId},
        ${'paid'},
        ${'processing'},
        ${'Processing started'},
        ${secondHistoryAt}
      )
    `;

    const detail =
      await getAdminOrderById(
        orderId,
      );

    assert.ok(detail);

    assert.equal(
      detail.id,
      orderId,
    );

    assert.equal(
      detail.status,
      'processing',
    );

    assert.equal(
      detail.customerName,
      'Detail Customer',
    );

    assert.equal(
      detail.totalRial,
      2_500_000,
    );

    assert.equal(
      detail.currency,
      'IRR',
    );

    assert.equal(
      detail.items.length,
      1,
    );

    assert.deepEqual(
      {
        productId:
          detail.items[0].productId,

        productName:
          detail.items[0].productName,

        brand:
          detail.items[0].brand,

        partNumber:
          detail.items[0].partNumber,

        quantity:
          detail.items[0].quantity,

        unitPriceRial:
          detail.items[0].unitPriceRial,

        lineTotalRial:
          detail.items[0].lineTotalRial,
      },
      {
        productId,
        productName:
          'Snapshot Detail Product',
        brand:
          'Snapshot Brand',
        partNumber:
          'B10-SNAPSHOT-PART',
        quantity:
          2,
        unitPriceRial:
          1_250_000,
        lineTotalRial:
          2_500_000,
      },
    );

    assert.equal(
      detail.payments.length,
      1,
    );

    assert.equal(
      detail.payments[0].status,
      'paid',
    );

    assert.equal(
      detail.payments[0].amountRial,
      2_500_000,
    );

    assert.equal(
      detail.payments[0].refId,
      'B10-REF-DETAIL',
    );

    assert.deepEqual(
      detail.statusHistory.map(
        (entry) => ({
          fromStatus:
            entry.fromStatus,

          toStatus:
            entry.toStatus,

          reason:
            entry.reason,
        }),
      ),
      [
        {
          fromStatus: null,
          toStatus: 'paid',
          reason:
            'Payment verified',
        },
        {
          fromStatus: 'paid',
          toStatus:
            'processing',
          reason:
            'Processing started',
        },
      ],
    );
  },
);
