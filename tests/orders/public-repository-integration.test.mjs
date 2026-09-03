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
    'TEST_DATABASE_URL is required for public order repository integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for public order repository integration tests.',
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
    adjustAdminProductInventory,
    createAdminProduct,
  },
  {
    createPublicPendingOrder,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),

    import(
      '../../src/server/products/repository.ts'
    ),

    import(
      '../../src/server/orders/public-repository.ts'
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

async function cleanupOwnedRows() {
  for (
    const orderId of
    ownedOrderIds
  ) {
    await migrationSql`
      delete
      from payments
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from order_status_history
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

function createProductInput() {
  const suffix =
    randomUUID();

  return {
    contentId:
      `b13-public-order-${suffix}`,

    sku:
      `B13-SKU-${suffix}`,

    partNumber:
      `B13-PART-${suffix}`,

    name:
      'B13 Public Order Product',

    brand:
      'B13 Test Brand',

    manufacturer:
      null,

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
      1_250_000,
  };
}

async function createProductWithStock(
  quantity,
) {
  const product =
    await createAdminProduct(
      createProductInput(),
    );

  ownedProductIds.add(
    product.id,
  );

  await adjustAdminProductInventory(
    product.id,
    {
      quantityDelta:
        quantity,

      note:
        'B13 public order integration stock',
    },
  );

  return {
    ...product,

    onHand:
      quantity,

    reserved:
      0,

    available:
      quantity,
  };
}

function createPreparedOrder(
  product,
  quantity = 1,
) {
  const unitPriceRial =
    product.currentPriceRial;

  assert.equal(
    typeof unitPriceRial,
    'number',
  );

  const lineTotalRial =
    unitPriceRial *
    quantity;

  return {
    customer: {
      name:
        'مشتری تست B13',

      phone:
        '09121234567',

      city:
        'تهران',

      address:
        '',

      notes:
        '',
    },

    lines: [
      {
        productId:
          product.id,

        name:
          product.name,

        brand:
          product.brand,

        partNumber:
          product.partNumber,

        quantity,

        unitPriceRial,

        lineTotalRial,

        shippingClass:
          product.shippingClass,
      },
    ],

    shippingMethodId:
      'pickup',

    shippingMethodLabel:
      'تحویل حضوری',

    subtotalRial:
      lineTotalRial,

    shippingFeeRial:
      0,

    totalRial:
      lineTotalRial,

    currency:
      'IRR',

    paymentReady:
      true,
  };
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
  'public order repository atomically creates the pending order item history reservation and reserved inventory',
  async () => {
    const product =
      await createProductWithStock(
        5,
      );

    const createdAt =
      new Date(
        '2026-09-02T06:00:00.000Z',
      );

    const reservationExpiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const result =
      await createPublicPendingOrder({
        order:
          createPreparedOrder(
            product,
            2,
          ),

        createdAt,

        reservationExpiresAt,
      });

    assert.equal(
      result.status,
      'created',
    );

    ownedOrderIds.add(
      result.orderId,
    );

    assert.equal(
      result.orderStatus,
      'pending',
    );

    assert.match(
      result.orderNumber,
      /^CNC-20260902-[0-9A-F]{12}$/,
    );

    const [orderRow] =
      await migrationSql`
        select
          order_number,
          status,
          customer_phone,
          subtotal_rial,
          total_rial,
          payment_ready
        from orders
        where id =
          ${result.orderId}
      `;

    assert.ok(
      orderRow,
    );

    assert.equal(
      orderRow.order_number,
      result.orderNumber,
    );

    assert.equal(
      orderRow.status,
      'pending',
    );

    assert.equal(
      orderRow.customer_phone,
      '09121234567',
    );

    assert.equal(
      orderRow.payment_ready,
      true,
    );

    const [itemRow] =
      await migrationSql`
        select
          product_id,
          quantity,
          unit_price_rial,
          line_total_rial
        from order_items
        where order_id =
          ${result.orderId}
      `;

    assert.ok(
      itemRow,
    );

    assert.equal(
      itemRow.product_id,
      product.id,
    );

    assert.equal(
      itemRow.quantity,
      2,
    );

    const [reservationRow] =
      await migrationSql`
        select
          product_id,
          quantity,
          status,
          expires_at
        from inventory_reservations
        where order_id =
          ${result.orderId}
      `;

    assert.ok(
      reservationRow,
    );

    assert.equal(
      reservationRow.product_id,
      product.id,
    );

    assert.equal(
      reservationRow.quantity,
      2,
    );

    assert.equal(
      reservationRow.status,
      'active',
    );

    assert.equal(
      reservationRow.expires_at
        .getTime(),
      reservationExpiresAt
        .getTime(),
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      5,
    );

    assert.equal(
      inventoryRow.reserved,
      2,
    );

    const historyRows =
      await migrationSql`
        select
          from_status,
          to_status,
          reason
        from order_status_history
        where order_id =
          ${result.orderId}
      `;

    assert.equal(
      historyRows.length,
      1,
    );

    assert.equal(
      historyRows[0]
        .from_status,
      null,
    );

    assert.equal(
      historyRows[0]
        .to_status,
      'pending',
    );

    assert.equal(
      historyRows[0]
        .reason,
      'public_checkout_created',
    );
  },
);

test(
  'public order repository rejects insufficient stock without partial order or reservation writes',
  async () => {
    const product =
      await createProductWithStock(
        1,
      );

    const createdAt =
      new Date(
        '2026-09-02T06:10:00.000Z',
      );

    const result =
      await createPublicPendingOrder({
        order:
          createPreparedOrder(
            product,
            2,
          ),

        createdAt,

        reservationExpiresAt:
          new Date(
            createdAt.getTime() +
            30 * 60 * 1000,
          ),
      });

    assert.deepEqual(
      result,
      {
        status:
          'stock_unavailable',

        productId:
          product.id,
      },
    );

    const orderRows =
      await migrationSql`
        select oi.order_id
        from order_items oi
        where oi.product_id =
          ${product.id}
      `;

    assert.equal(
      orderRows.length,
      0,
    );

    const reservationRows =
      await migrationSql`
        select id
        from inventory_reservations
        where product_id =
          ${product.id}
      `;

    assert.equal(
      reservationRows.length,
      0,
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      1,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );
  },
);

test(
  'concurrent public orders cannot reserve the same last unit twice',
  async () => {
    const product =
      await createProductWithStock(
        1,
      );

    const createdAt =
      new Date(
        '2026-09-02T06:20:00.000Z',
      );

    const input = {
      order:
        createPreparedOrder(
          product,
          1,
        ),

      createdAt,

      reservationExpiresAt:
        new Date(
          createdAt.getTime() +
          30 * 60 * 1000,
        ),
    };

    const results =
      await Promise.all([
        createPublicPendingOrder(
          input,
        ),

        createPublicPendingOrder(
          input,
        ),
      ]);

    const createdResults =
      results.filter(
        (result) =>
          result.status ===
          'created',
      );

    const unavailableResults =
      results.filter(
        (result) =>
          result.status ===
          'stock_unavailable',
      );

    assert.equal(
      createdResults.length,
      1,
    );

    assert.equal(
      unavailableResults.length,
      1,
    );

    ownedOrderIds.add(
      createdResults[0].orderId,
    );

    assert.equal(
      unavailableResults[0]
        .productId,
      product.id,
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      1,
    );

    assert.equal(
      inventoryRow.reserved,
      1,
    );

    const [reservationCount] =
      await migrationSql`
        select
          count(*)::int
            as count
        from inventory_reservations
        where product_id =
          ${product.id}
          and status =
            'active'
      `;

    assert.equal(
      reservationCount.count,
      1,
    );
  },
);
test(
  'public order repository rejects a stale commerce snapshot before writing an order',
  async () => {
    const product =
      await createProductWithStock(
        3,
      );

    const staleOrder =
      createPreparedOrder(
        product,
        1,
      );

    const changedPriceRial =
      product.currentPriceRial +
      500_000;

    const updatedPriceRows =
      await migrationSql`
        update product_prices
        set amount_rial =
          ${changedPriceRial}
        where product_id =
          ${product.id}
          and valid_to is null
        returning amount_rial
      `;

    assert.equal(
      updatedPriceRows.length,
      1,
    );

    assert.equal(
      Number(
        updatedPriceRows[0]
          .amount_rial,
      ),
      changedPriceRial,
    );

    const createdAt =
      new Date(
        '2026-09-02T06:30:00.000Z',
      );

    const result =
      await createPublicPendingOrder({
        order:
          staleOrder,

        createdAt,

        reservationExpiresAt:
          new Date(
            createdAt.getTime() +
            30 * 60 * 1000,
          ),
      });

    assert.deepEqual(
      result,
      {
        status:
          'commerce_changed',

        productId:
          product.id,
      },
    );

    const orderItemRows =
      await migrationSql`
        select order_id
        from order_items
        where product_id =
          ${product.id}
      `;

    assert.equal(
      orderItemRows.length,
      0,
    );

    const reservationRows =
      await migrationSql`
        select id
        from inventory_reservations
        where product_id =
          ${product.id}
      `;

    assert.equal(
      reservationRows.length,
      0,
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      3,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );
  },
);

test(
  'public order transaction revalidates price after a concurrent price change wins the product lock',
  async () => {
    const product =
      await createProductWithStock(
        2,
      );

    const staleOrder =
      createPreparedOrder(
        product,
        1,
      );

    const changedPriceRial =
      product.currentPriceRial +
      700_000;

    let releasePriceTransaction;

    const releasePriceLock =
      new Promise(
        (resolve) => {
          releasePriceTransaction =
            resolve;
        },
      );

    let markProductLocked;

    const productLocked =
      new Promise(
        (resolve) => {
          markProductLocked =
            resolve;
        },
      );

    const priceTransaction =
      migrationSql.begin(
        async (sql) => {
          await sql`
            select id
            from products
            where id =
              ${product.id}
            for update
          `;

          markProductLocked();

          await releasePriceLock;

          await sql`
            update product_prices
            set valid_to = now()
            where product_id =
              ${product.id}
              and valid_to is null
          `;

          await sql`
            insert into product_prices (
              product_id,
              amount_rial,
              currency,
              valid_from,
              valid_to
            )
            values (
              ${product.id},
              ${changedPriceRial},
              ${'IRR'},
              now(),
              null
            )
          `;
        },
      );

    await productLocked;

    const createdAt =
      new Date(
        '2026-09-02T07:00:00.000Z',
      );

    const orderPromise =
      createPublicPendingOrder({
        order:
          staleOrder,

        createdAt,

        reservationExpiresAt:
          new Date(
            createdAt.getTime() +
            30 * 60 * 1000,
          ),
      });

    releasePriceTransaction();

    await priceTransaction;

    const result =
      await orderPromise;

    assert.deepEqual(
      result,
      {
        status:
          'commerce_changed',

        productId:
          product.id,
      },
    );

    const orderRows =
      await migrationSql`
        select id
        from orders
        where id in (
          select order_id
          from order_items
          where product_id =
            ${product.id}
        )
      `;

    assert.equal(
      orderRows.length,
      0,
    );

    const reservationRows =
      await migrationSql`
        select id
        from inventory_reservations
        where product_id =
          ${product.id}
      `;

    assert.equal(
      reservationRows.length,
      0,
    );

    const [inventoryRow] =
      await migrationSql`
        select reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.reserved,
      0,
    );
  },
);
