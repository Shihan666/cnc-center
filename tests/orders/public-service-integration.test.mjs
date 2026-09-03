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
    'TEST_DATABASE_URL is required for public order service integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for public order service integration tests.',
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
    createPublicCheckoutOrder,
    PUBLIC_ORDER_RESERVATION_TTL_MS,
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
      '../../src/server/orders/public-service.ts'
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

function createProductInput({
  contentId,
  commerceMode =
    'direct-purchase',
  priceVisibility =
    'visible',
  status =
    'active',
} = {}) {
  const suffix =
    randomUUID();

  return {
    contentId:
      contentId ??
      `b13-service-${suffix}`,

    sku:
      `B13-SERVICE-SKU-${suffix}`,

    partNumber:
      `B13-SERVICE-PART-${suffix}`,

    name:
      'B13 Service Product',

    brand:
      'B13 Service Brand',

    manufacturer:
      null,

    condition:
      'new',

    commerceMode,

    priceVisibility,

    shippingClass:
      'standard',

    status,

    priceRial:
      2_000_000,
  };
}

async function createProductWithStock({
  contentId,
  stock = 5,
  commerceMode =
    'direct-purchase',
  priceVisibility =
    'visible',
  status =
    'active',
} = {}) {
  const product =
    await createAdminProduct(
      createProductInput({
        contentId,
        commerceMode,
        priceVisibility,
        status,
      }),
    );

  ownedProductIds.add(
    product.id,
  );

  if (stock > 0) {
    await adjustAdminProductInventory(
      product.id,
      {
        quantityDelta:
          stock,

        note:
          'B13 service integration stock',
      },
    );
  }

  return product;
}

function createSubmission(
  contentId,
  quantity = 1,
) {
  return {
    items: [
      {
        productId:
          contentId,

        quantity,
      },
    ],

    name:
      'مشتری سرویس B13',

    phone:
      '09121234567',

    city:
      'تهران',

    address:
      '',

    shippingMethodId:
      'pickup',

    notes:
      '',
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
  'public checkout service resolves storefront content id to authoritative database product id',
  async () => {
    const contentId =
      `b13-service-public-${randomUUID()}`;

    const product =
      await createProductWithStock({
        contentId,
        stock:
          4,
      });

    const createdAt =
      new Date(
        '2026-09-02T07:00:00.000Z',
      );

    const result =
      await createPublicCheckoutOrder({
        submission:
          createSubmission(
            contentId,
            2,
          ),

        createdAt,
      });

    assert.equal(
      result.status,
      'created',
    );

    ownedOrderIds.add(
      result.orderId,
    );

    assert.equal(
      result.reservationExpiresAt
        .getTime(),
      createdAt.getTime() +
        PUBLIC_ORDER_RESERVATION_TTL_MS,
    );

    const [item] =
      await migrationSql`
        select
          product_id,
          product_name,
          brand,
          part_number,
          quantity,
          unit_price_rial
        from order_items
        where order_id =
          ${result.orderId}
      `;

    assert.ok(
      item,
    );

    assert.equal(
      item.product_id,
      product.id,
    );

    assert.notEqual(
      item.product_id,
      contentId,
    );

    assert.equal(
      item.product_name,
      'B13 Service Product',
    );

    assert.equal(
      item.brand,
      'B13 Service Brand',
    );

    assert.equal(
      item.quantity,
      2,
    );

    assert.equal(
      Number(
        item.unit_price_rial,
      ),
      2_000_000,
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
      4,
    );

    assert.equal(
      inventoryRow.reserved,
      2,
    );
  },
);

test(
  'public checkout service rejects an unknown storefront product without creating an order',
  async () => {
    const unknownContentId =
      `missing-b13-${randomUUID()}`;

    const result =
      await createPublicCheckoutOrder({
        submission:
          createSubmission(
            unknownContentId,
          ),

        createdAt:
          new Date(
            '2026-09-02T07:10:00.000Z',
          ),
      });

    assert.equal(
      result.status,
      'invalid_order',
    );

    assert.equal(
      result.errors.some(
        (error) =>
          error.code ===
            'product-unavailable' &&
          error.productId ===
            unknownContentId,
      ),
      true,
    );
  },
);

test(
  'public checkout service rejects database products that are not eligible for direct purchase',
  async () => {
    const contentId =
      `hidden-b13-${randomUUID()}`;

    await createProductWithStock({
      contentId,
      stock:
        3,

      priceVisibility:
        'hidden',
    });

    const result =
      await createPublicCheckoutOrder({
        submission:
          createSubmission(
            contentId,
          ),

        createdAt:
          new Date(
            '2026-09-02T07:20:00.000Z',
          ),
      });

    assert.equal(
      result.status,
      'invalid_order',
    );

    assert.equal(
      result.errors.some(
        (error) =>
          error.code ===
          'product-unavailable',
      ),
      true,
    );
  },
);