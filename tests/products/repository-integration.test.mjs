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
    'TEST_DATABASE_URL is required for product repository integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for product repository integration tests.',
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
    getAdminProductById,
    setAdminProductPrice,
    updateAdminProduct,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
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

function createInput({
  suffix,
  priceRial = 1_250_000,
} = {}) {
  const uniqueSuffix =
    suffix ??
    randomUUID();

  return {
    contentId:
      `b11-product-${uniqueSuffix}`,
    sku:
      `B11-SKU-${uniqueSuffix}`,
    partNumber:
      `B11-PART-${uniqueSuffix}`,
    name:
      'B11 Repository Product',
    brand:
      'B11 Test Brand',
    manufacturer:
      'B11 Test Manufacturer',
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
    priceRial,
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
  'product repository creates a product with zero inventory and an optional current price',
  async () => {
    const created =
      await createAdminProduct(
        createInput(),
      );

    ownedProductIds.add(
      created.id,
    );

    assert.equal(
      created.onHand,
      0,
    );

    assert.equal(
      created.reserved,
      0,
    );

    assert.equal(
      created.available,
      0,
    );

    assert.equal(
      created.currentPriceRial,
      1_250_000,
    );

    assert.equal(
      created.priceHistory.length,
      1,
    );

    const withoutPrice =
      await createAdminProduct(
        createInput({
          priceRial: null,
        }),
      );

    ownedProductIds.add(
      withoutPrice.id,
    );

    assert.equal(
      withoutPrice.currentPriceRial,
      null,
    );

    assert.equal(
      withoutPrice.priceHistory.length,
      0,
    );
  },
);

test(
  'product repository updates product metadata without changing price or inventory',
  async () => {
    const created =
      await createAdminProduct(
        createInput(),
      );

    ownedProductIds.add(
      created.id,
    );

    const updated =
      await updateAdminProduct(
        created.id,
        {
          contentId:
            created.contentId,
          sku:
            created.sku,
          partNumber:
            created.partNumber,
          name:
            'B11 Updated Product',
          brand:
            'B11 Updated Brand',
          manufacturer:
            null,
          condition:
            'tested',
          commerceMode:
            'price-inquiry',
          priceVisibility:
            'hidden',
          shippingClass:
            'standard',
          status:
            'archived',
        },
      );

    assert.ok(updated);

    assert.equal(
      updated.name,
      'B11 Updated Product',
    );

    assert.equal(
      updated.brand,
      'B11 Updated Brand',
    );

    assert.equal(
      updated.manufacturer,
      null,
    );

    assert.equal(
      updated.condition,
      'tested',
    );

    assert.equal(
      updated.commerceMode,
      'price-inquiry',
    );

    assert.equal(
      updated.priceVisibility,
      'hidden',
    );

    assert.equal(
      updated.status,
      'archived',
    );

    assert.equal(
      updated.currentPriceRial,
      1_250_000,
    );

    assert.equal(
      updated.onHand,
      0,
    );
  },
);

test(
  'product repository preserves price history and avoids duplicate history for an unchanged price',
  async () => {
    const created =
      await createAdminProduct(
        createInput(),
      );

    ownedProductIds.add(
      created.id,
    );

    const unchanged =
      await setAdminProductPrice(
        created.id,
        {
          amountRial:
            1_250_000,
        },
      );

    assert.ok(unchanged);

    assert.equal(
      unchanged.priceHistory.length,
      1,
    );

    const changed =
      await setAdminProductPrice(
        created.id,
        {
          amountRial:
            1_500_000,
        },
      );

    assert.ok(changed);

    assert.equal(
      changed.currentPriceRial,
      1_500_000,
    );

    assert.equal(
      changed.priceHistory.length,
      2,
    );

    const currentRows =
      changed.priceHistory.filter(
        (price) =>
          price.validTo === null,
      );

    assert.equal(
      currentRows.length,
      1,
    );

    assert.equal(
      currentRows[0]
        .amountRial,
      1_500_000,
    );
  },
);

test(
  'product repository adjusts inventory and records an admin movement',
  async () => {
    const created =
      await createAdminProduct(
        createInput(),
      );

    ownedProductIds.add(
      created.id,
    );

    const adjusted =
      await adjustAdminProductInventory(
        created.id,
        {
          quantityDelta:
            7,
          note:
            'B11 integration adjustment',
        },
      );

    assert.ok(adjusted);

    assert.equal(
      adjusted.onHand,
      7,
    );

    assert.equal(
      adjusted.reserved,
      0,
    );

    assert.equal(
      adjusted.available,
      7,
    );

    assert.equal(
      adjusted.inventoryMovements.length,
      1,
    );

    assert.equal(
      adjusted.inventoryMovements[0]
        .type,
      'adjustment',
    );

    assert.equal(
      adjusted.inventoryMovements[0]
        .quantityDelta,
      7,
    );

    assert.equal(
      adjusted.inventoryMovements[0]
        .referenceType,
      'admin',
    );

    assert.equal(
      adjusted.inventoryMovements[0]
        .note,
      'B11 integration adjustment',
    );
  },
);

test(
  'product repository rejects inventory adjustments that would make stock negative',
  async () => {
    const created =
      await createAdminProduct(
        createInput(),
      );

    ownedProductIds.add(
      created.id,
    );

    await assert.rejects(
      () =>
        adjustAdminProductInventory(
          created.id,
          {
            quantityDelta:
              -1,
            note:
              null,
          },
        ),
      /cannot make on-hand quantity negative/,
    );

    const loaded =
      await getAdminProductById(
        created.id,
      );

    assert.ok(loaded);

    assert.equal(
      loaded.onHand,
      0,
    );

    assert.equal(
      loaded.inventoryMovements.length,
      0,
    );
  },
);

test(
  'product repository returns null for invalid product ids',
  async () => {
    assert.equal(
      await updateAdminProduct(
        'not-a-product-id',
        {
          contentId:
            'unused',
          sku:
            null,
          partNumber:
            'unused',
          name:
            'unused',
          brand:
            'unused',
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
        },
      ),
      null,
    );

    assert.equal(
      await setAdminProductPrice(
        'not-a-product-id',
        {
          amountRial:
            1,
        },
      ),
      null,
    );

    assert.equal(
      await adjustAdminProductInventory(
        'not-a-product-id',
        {
          quantityDelta:
            1,
          note:
            null,
        },
      ),
      null,
    );
  },
);