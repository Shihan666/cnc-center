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

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL
    ?.trim();

const testMigrationUrl =
  process.env.TEST_DATABASE_MIGRATION_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required.',
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
    createPublicCheckoutOrder,
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
      '../../src/server/orders/public-service.ts'
    ),

    import(
      '../../src/pages/api/orders/track.ts'
    ),
  ]);

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max:
        2,

      prepare:
        false,
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
  origin =
    SITE_ORIGIN,
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

  return {
    request:
      new Request(
        `${SITE_ORIGIN}/api/orders/track`,
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
      ),

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
      `B15-TRACK-SKU-${suffix}`,

    partNumber:
      `B15-TRACK-PART-${suffix}`,

    name:
      'B15 Tracking Product',

    brand:
      'B15 Tracking Brand',

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

async function createTrackedOrder() {
  const contentId =
    `b15-track-${randomUUID()}`;

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
        2,

      note:
        'B15 public tracking test stock',
    },
  );

  const createdAt =
    new Date(
      '2026-09-03T18:00:00.000Z',
    );

  const result =
    await createPublicCheckoutOrder({
      submission: {
        items: [
          {
            productId:
              contentId,

            quantity:
              1,
          },
        ],

        name:
          'مشتری تست پیگیری',

        phone:
          '۰۹۱۲ ۱۲۳ ۴۵۶۷',

        city:
          'تهران',

        address:
          '',

        shippingMethodId:
          'pickup',

        notes:
          '',
      },

      createdAt,
    });

  assert.equal(
    result.status,
    'created',
  );

  ownedOrderIds.add(
    result.orderId,
  );

  return result;
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
        timeout:
          5,
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
  'public tracking API requires JSON and same-origin requests',
  async () => {
    const unsupported =
      await POST(
        createContext({
          body:
            '{}',

          contentType:
            'text/plain',
        }),
      );

    assert.equal(
      unsupported.status,
      415,
    );

    const forbidden =
      await POST(
        createContext({
          body: {
            orderNumber:
              'CNC-20260903-AAAAAAAAAAAA',

            phone:
              '09121234567',
          },

          origin:
            'https://evil.example',
        }),
      );

    assert.equal(
      forbidden.status,
      403,
    );
  },
);

test(
  'public tracking API rejects malformed or invalid lookup input',
  async () => {
    const malformed =
      await POST(
        createContext({
          body:
            '{"orderNumber":',
        }),
      );

    assert.equal(
      malformed.status,
      400,
    );

    const malformedBody =
      await malformed.json();

    assert.equal(
      malformedBody.reason,
      'invalid_json',
    );

    const invalid =
      await POST(
        createContext({
          body: {
            orderNumber:
              'wrong',

            phone:
              '12',
          },
        }),
      );

    assert.equal(
      invalid.status,
      400,
    );

    const invalidBody =
      await invalid.json();

    assert.equal(
      invalidBody.reason,
      'invalid_input',
    );
  },
);

test(
  'public tracking API returns only limited tracking data for matching order number and phone',
  async () => {
    const order =
      await createTrackedOrder();

    const response =
      await POST(
        createContext({
          body: {
            orderNumber:
              order.orderNumber
                .toLowerCase(),

            phone:
              '+98 912 123 4567',
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
      body.order.orderNumber,
      order.orderNumber,
    );

    assert.equal(
      body.order.status,
      'pending',
    );

    assert.equal(
      body.order.createdAt,
      order.createdAt
        .toISOString(),
    );

    assert.equal(
      body.order.paidAt,
      null,
    );

    assert.deepEqual(
      Object.keys(
        body.order,
      ).sort(),
      [
        'createdAt',
        'orderNumber',
        'paidAt',
        'status',
        'updatedAt',
      ],
    );

    assert.equal(
      'customerPhone' in
        body.order,
      false,
    );

    assert.equal(
      'customerAddress' in
        body.order,
      false,
    );

    assert.equal(
      'customerName' in
        body.order,
      false,
    );
  },
);

test(
  'public tracking API does not reveal whether an order number exists when phone does not match',
  async () => {
    const order =
      await createTrackedOrder();

    const wrongPhone =
      await POST(
        createContext({
          body: {
            orderNumber:
              order.orderNumber,

            phone:
              '09129999999',
          },
        }),
      );

    assert.equal(
      wrongPhone.status,
      404,
    );

    const wrongPhoneBody =
      await wrongPhone.json();

    assert.deepEqual(
      wrongPhoneBody,
      {
        ok:
          false,

        reason:
          'not_found',
      },
    );

    const missingOrder =
      await POST(
        createContext({
          body: {
            orderNumber:
              'CNC-20260903-ABCDEF123456',

            phone:
              '09121234567',
          },
        }),
      );

    assert.equal(
      missingOrder.status,
      404,
    );

    const missingOrderBody =
      await missingOrder.json();

    assert.deepEqual(
      missingOrderBody,
      wrongPhoneBody,
    );
  },
);