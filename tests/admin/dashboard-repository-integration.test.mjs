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
    'TEST_DATABASE_URL is required for dashboard repository integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for dashboard repository integration tests.',
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
    getAdminDashboardSnapshot,
  },
  {
    adjustAdminProductInventory,
    createAdminProduct,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/dashboard/repository.ts'
    ),
    import(
      '../../src/server/products/repository.ts'
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
  status,
  customerName,
  totalRial,
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
        ${'09120000000'},
        ${'Tehran'},
        ${'B18 dashboard test address'},
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

async function insertStatusHistory({
  orderId,
  fromStatus,
  toStatus,
  createdAt,
}) {
  await migrationSql`
    insert into order_status_history (
      order_id,
      from_status,
      to_status,
      reason,
      created_at
    )
    values (
      ${orderId},
      ${fromStatus},
      ${toStatus},
      ${'b18_dashboard_repository_test'},
      ${createdAt}
    )
  `;
}

function createProductInput(
  label,
) {
  const suffix =
    randomUUID();

  return {
    contentId:
      `b18-dashboard-${label}-${suffix}`,
    sku:
      `B18-${label}-${suffix}`,
    partNumber:
      `B18-PART-${label}-${suffix}`,
    name:
      `B18 Dashboard ${label} ${suffix}`,
    brand:
      'B18 Dashboard Brand',
    manufacturer:
      'B18 Dashboard Manufacturer',
    condition:
      'new',
    commerceMode:
      'direct-purchase',
    priceVisibility:
      'visible',
    shippingClass:
      'standard',
    status:
      'active',
    priceRial:
      1_000_000,
  };
}

async function createOwnedProduct(
  label,
) {
  const product =
    await createAdminProduct(
      createProductInput(
        label,
      ),
    );

  ownedProductIds.add(
    product.id,
  );

  return product;
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

  ownedOrderIds.clear();

  for (
    const productId of
    ownedProductIds
  ) {
    await migrationSql`
      delete
      from inventory_movements
      where product_id =
        ${productId}
    `;

    await migrationSql`
      delete
      from product_prices
      where product_id =
        ${productId}
    `;

    await migrationSql`
      delete
      from inventory
      where product_id =
        ${productId}
    `;

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
  'dashboard snapshot derives action and Tehran-today counts from authoritative state',
  async () => {
    const now =
      new Date(
        '2099-09-04T12:00:00.000Z',
      );

    const baseline =
      await getAdminDashboardSnapshot(
        now,
      );

    const zeroStockProduct =
      await createOwnedProduct(
        'zero-stock',
      );

    assert.equal(
      zeroStockProduct.onHand,
      0,
    );

    const stockedProduct =
      await createOwnedProduct(
        'stocked',
      );

    const adjusted =
      await adjustAdminProductInventory(
        stockedProduct.id,
        {
          quantityDelta:
            3,
          note:
            'B18 dashboard repository test',
        },
      );

    assert.ok(adjusted);

    const paidOrderId =
      await insertOrder({
        orderNumber:
          `B18-PAID-${randomUUID()}`,
        status:
          'paid',
        customerName:
          'B18 Paid Customer',
        totalRial:
          1_100_000,
        createdAt:
          new Date(
            '2099-09-04T09:00:00.000Z',
          ),
      });

    assert.ok(paidOrderId);

    const readyOrderId =
      await insertOrder({
        orderNumber:
          `B18-READY-${randomUUID()}`,
        status:
          'ready_to_ship',
        customerName:
          'B18 Ready Customer',
        totalRial:
          1_200_000,
        createdAt:
          new Date(
            '2099-09-04T10:00:00.000Z',
          ),
      });

    const shippedOrderId =
      await insertOrder({
        orderNumber:
          `B18-SHIPPED-${randomUUID()}`,
        status:
          'shipped',
        customerName:
          'B18 Shipped Customer',
        totalRial:
          1_300_000,
        createdAt:
          new Date(
            '2099-09-04T11:00:00.000Z',
          ),
      });

    await insertStatusHistory({
      orderId:
        readyOrderId,
      fromStatus:
        'processing',
      toStatus:
        'ready_to_ship',
      createdAt:
        new Date(
          '2099-09-04T10:30:00.000Z',
        ),
    });

    await insertStatusHistory({
      orderId:
        shippedOrderId,
      fromStatus:
        'ready_to_ship',
      toStatus:
        'shipped',
      createdAt:
        new Date(
          '2099-09-04T11:30:00.000Z',
        ),
    });

    const after =
      await getAdminDashboardSnapshot(
        now,
      );

    assert.equal(
      after.actions.readyToShip,
      baseline.actions.readyToShip + 1,
    );

    assert.equal(
      after.actions.needsProcessing,
      baseline.actions.needsProcessing + 1,
    );

    assert.equal(
      after.actions.outOfStock,
      baseline.actions.outOfStock + 1,
    );

    assert.equal(
      after.today.newOrders,
      baseline.today.newOrders + 3,
    );

    assert.equal(
      after.today.readyToShip,
      baseline.today.readyToShip + 1,
    );

    assert.equal(
      after.today.shipped,
      baseline.today.shipped + 1,
    );
  },
);

test(
  'dashboard snapshot returns only the five most recent orders with minimal dashboard fields',
  async () => {
    const now =
      new Date(
        '2099-09-04T12:00:00.000Z',
      );

    const created = [];

    for (
      let index = 0;
      index < 6;
      index += 1
    ) {
      const orderNumber =
        `B18-RECENT-${index}-${randomUUID()}`;

      const createdAt =
        new Date(
          Date.UTC(
            2099,
            8,
            4,
            8 + index,
            0,
            0,
          ),
        );

      const id =
        await insertOrder({
          orderNumber,
          status:
            index === 5
              ? 'cancelled'
              : 'pending',
          customerName:
            `B18 Recent Customer ${index}`,
          totalRial:
            2_000_000 + index,
          createdAt,
        });

      created.push({
        id,
        orderNumber,
        createdAt,
      });
    }

    const snapshot =
      await getAdminDashboardSnapshot(
        now,
      );

    const expectedRecent =
      [...created]
        .sort(
          (left, right) =>
            right.createdAt.getTime() -
            left.createdAt.getTime(),
        )
        .slice(0, 5);

    assert.deepEqual(
      snapshot.recentOrders.map(
        (item) =>
          item.orderNumber,
      ),
      expectedRecent.map(
        (item) =>
          item.orderNumber,
      ),
    );

    assert.equal(
      snapshot.recentOrders.length,
      5,
    );

    assert.deepEqual(
      Object.keys(
        snapshot.recentOrders[0],
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
        snapshot.recentOrders[0],
        'customerPhone',
      ),
      false,
    );

    assert.equal(
      Object.hasOwn(
        snapshot.recentOrders[0],
        'customerAddress',
      ),
      false,
    );
  },
);
