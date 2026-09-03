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
    'TEST_DATABASE_URL is required for public orders API integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for public orders API integration tests.',
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
    createAdminProduct,
    adjustAdminProductInventory,
  },
  {
    POST,
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
      '../../src/pages/api/orders.ts'
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

const SITE_ORIGIN =
  'https://cnc-center.test';

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

function createContext({
  body,
  origin = SITE_ORIGIN,
  contentType =
    'application/json',
} = {}) {
  const headers =
    new Headers();

  if (origin !== null) {
    headers.set(
      'Origin',
      origin,
    );
  }

  if (contentType !== null) {
    headers.set(
      'Content-Type',
      contentType,
    );
  }

  const request =
    new Request(
      `${SITE_ORIGIN}/api/orders`,
      {
        method:
          'POST',

        headers,

        body:
          typeof body ===
          'string'
            ? body
            : JSON.stringify(
                body ?? {},
              ),
      },
    );

  return {
    request,

    site:
      new URL(
        SITE_ORIGIN,
      ),
  };
}

function createProductInput(
  contentId,
) {
  const suffix =
    randomUUID();

  return {
    contentId,

    sku:
      `B13-API-SKU-${suffix}`,

    partNumber:
      `B13-API-PART-${suffix}`,

    name:
      'B13 API Product',

    brand:
      'B13 API Brand',

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
      3_000_000,
  };
}

async function createProductWithStock(
  stock = 3,
) {
  const contentId =
    `b13-api-${randomUUID()}`;

  const product =
    await createAdminProduct(
      createProductInput(
        contentId,
      ),
    );

  ownedProductIds.add(
    product.id,
  );

  await adjustAdminProductInventory(
    product.id,
    {
      quantityDelta:
        stock,

      note:
        'B13 public API test stock',
    },
  );

  return {
    product,
    contentId,
  };
}

function createCheckoutBody(
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
      'مشتری API B13',

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
  'public orders API requires JSON and same-origin requests',
  async () => {
    const unsupportedResponse =
      await POST(
        createContext({
          body:
            '{}',

          contentType:
            'text/plain',
        }),
      );

    assert.equal(
      unsupportedResponse.status,
      415,
    );

    const unsupportedBody =
      await unsupportedResponse.json();

    assert.equal(
      unsupportedBody.reason,
      'unsupported_media_type',
    );

    const forbiddenResponse =
      await POST(
        createContext({
          body: {},
          origin:
            'https://evil.example',
        }),
      );

    assert.equal(
      forbiddenResponse.status,
      403,
    );

    const forbiddenBody =
      await forbiddenResponse.json();

    assert.equal(
      forbiddenBody.reason,
      'forbidden',
    );
  },
);

test(
  'public orders API rejects malformed JSON',
  async () => {
    const response =
      await POST(
        createContext({
          body:
            '{"items":',
        }),
      );

    assert.equal(
      response.status,
      400,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      false,
    );

    assert.equal(
      body.reason,
      'invalid_json',
    );
  },
);

test(
  'public orders API creates a real pending order and inventory reservation',
  async () => {
    const {
      product,
      contentId,
    } =
      await createProductWithStock(
        3,
      );

    const response =
      await POST(
        createContext({
          body:
            createCheckoutBody(
              contentId,
              2,
            ),
        }),
      );

    assert.equal(
      response.status,
      201,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      body.order.status,
      'pending',
    );

    assert.equal(
      typeof body.order.id,
      'string',
    );

    assert.equal(
      typeof body.order.orderNumber,
      'string',
    );

    ownedOrderIds.add(
      body.order.id,
    );

    const [orderRow] =
      await migrationSql`
        select
          id,
          status,
          customer_phone,
          payment_ready
        from orders
        where id =
          ${body.order.id}
      `;

    assert.ok(
      orderRow,
    );

    assert.equal(
      orderRow.status,
      'pending',
    );

    assert.equal(
      orderRow.customer_phone,
      '09121234567',
    );

    const [itemRow] =
      await migrationSql`
        select
          product_id,
          quantity,
          unit_price_rial
        from order_items
        where order_id =
          ${body.order.id}
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

    assert.equal(
      Number(
        itemRow.unit_price_rial,
      ),
      3_000_000,
    );

    const [reservationRow] =
      await migrationSql`
        select
          product_id,
          quantity,
          status
        from inventory_reservations
        where order_id =
          ${body.order.id}
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
      2,
    );
  },
);

test(
  'public orders API returns validation errors for unavailable storefront products',
  async () => {
    const missingContentId =
      `missing-b13-api-${randomUUID()}`;

    const response =
      await POST(
        createContext({
          body:
            createCheckoutBody(
              missingContentId,
            ),
        }),
      );

    assert.equal(
      response.status,
      400,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      false,
    );

    assert.equal(
      body.reason,
      'invalid_order',
    );

    assert.equal(
      Array.isArray(
        body.errors,
      ),
      true,
    );

    assert.equal(
      body.errors.some(
        (error) =>
          error.code ===
            'product-unavailable' &&
          error.productId ===
            missingContentId,
      ),
      true,
    );
  },
);