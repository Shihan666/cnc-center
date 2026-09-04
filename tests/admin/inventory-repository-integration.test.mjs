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
    'TEST_DATABASE_URL is required for inventory repository integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for inventory repository integration tests.',
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
    getAdminInventorySummary,
    listAdminInventory,
    listRecentAdminInventoryMovements,
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
      '../../src/server/inventory/repository.ts'
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

function createInput({
  suffix,
  name,
  brand,
  partNumber,
  sku,
} = {}) {
  const uniqueSuffix =
    suffix ??
    randomUUID();

  return {
    contentId:
      `b17-inventory-${uniqueSuffix}`,
    sku:
      sku ??
      `B17-SKU-${uniqueSuffix}`,
    partNumber:
      partNumber ??
      `B17-PART-${uniqueSuffix}`,
    name:
      name ??
      `B17 Inventory Product ${uniqueSuffix}`,
    brand:
      brand ??
      `B17 Brand ${uniqueSuffix}`,
    manufacturer:
      'B17 Test Manufacturer',
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
      1_500_000,
  };
}

async function createOwnedProduct(
  input,
  quantityDelta = 0,
) {
  const product =
    await createAdminProduct(
      input,
    );

  ownedProductIds.add(
    product.id,
  );

  if (quantityDelta !== 0) {
    const adjusted =
      await adjustAdminProductInventory(
        product.id,
        {
          quantityDelta,
          note:
            'B17 inventory repository test',
        },
      );

    assert.ok(adjusted);

    return adjusted;
  }

  return product;
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
  'inventory repository returns authoritative physical, reserved, and available quantities',
  async () => {
    const suffix =
      randomUUID();

    const created =
      await createOwnedProduct(
        createInput({
          suffix,
          name:
            `B17 Spindle Motor ${suffix}`,
        }),
        7,
      );

    const result =
      await listAdminInventory({
        q:
          `B17 Spindle Motor ${suffix}`,
        inventoryStatus:
          'all',
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

    const item =
      result.items[0];

    assert.equal(
      item.productId,
      created.id,
    );

    assert.equal(
      item.onHand,
      7,
    );

    assert.equal(
      item.reserved,
      0,
    );

    assert.equal(
      item.available,
      7,
    );

    assert.ok(
      item.inventoryUpdatedAt instanceof Date,
    );
  },
);

test(
  'inventory repository filters in-stock and out-of-stock by physical on-hand quantity',
  async () => {
    const suffix =
      randomUUID();

    const zeroStock =
      await createOwnedProduct(
        createInput({
          suffix:
            `zero-${suffix}`,
          name:
            `B17 Filter ${suffix} Zero`,
        }),
      );

    const inStock =
      await createOwnedProduct(
        createInput({
          suffix:
            `stock-${suffix}`,
          name:
            `B17 Filter ${suffix} Stock`,
        }),
        4,
      );

    const outOfStockResult =
      await listAdminInventory({
        q:
          `B17 Filter ${suffix}`,
        inventoryStatus:
          'out-of-stock',
        page:
          1,
        pageSize:
          25,
      });

    assert.equal(
      outOfStockResult.total,
      1,
    );

    assert.equal(
      outOfStockResult.items[0].productId,
      zeroStock.id,
    );

    const inStockResult =
      await listAdminInventory({
        q:
          `B17 Filter ${suffix}`,
        inventoryStatus:
          'in-stock',
        page:
          1,
        pageSize:
          25,
      });

    assert.equal(
      inStockResult.total,
      1,
    );

    assert.equal(
      inStockResult.items[0].productId,
      inStock.id,
    );
  },
);

test(
  'inventory repository treats search wildcards literally and paginates matching products',
  async () => {
    const suffix =
      randomUUID();

    await createOwnedProduct(
      createInput({
        suffix:
          `percent-${suffix}`,
        name:
          `B17 Literal % ${suffix}`,
      }),
      1,
    );

    await createOwnedProduct(
      createInput({
        suffix:
          `decoy-${suffix}`,
        name:
          `B17 Literal X ${suffix}`,
      }),
      1,
    );

    const literal =
      await listAdminInventory({
        q:
          `B17 Literal % ${suffix}`,
        inventoryStatus:
          'all',
        page:
          1,
        pageSize:
          25,
      });

    assert.equal(
      literal.total,
      1,
    );

    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      await createOwnedProduct(
        createInput({
          suffix:
            `page-${index}-${suffix}`,
          name:
            `B17 Page ${suffix} ${index}`,
        }),
        index === 0
          ? 0
          : index,
      );
    }

    const firstPage =
      await listAdminInventory({
        q:
          `B17 Page ${suffix}`,
        inventoryStatus:
          'all',
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

    const secondPage =
      await listAdminInventory({
        q:
          `B17 Page ${suffix}`,
        inventoryStatus:
          'all',
        page:
          2,
        pageSize:
          2,
      });

    assert.equal(
      secondPage.items.length,
      1,
    );
  },
);
test(
  'inventory repository returns recent movement history with product identity',
  async () => {
    const suffix =
      randomUUID();

    const product =
      await createOwnedProduct(
        createInput({
          suffix:
            `history-${suffix}`,
          name:
            `B17 History Product ${suffix}`,
          partNumber:
            `B17-HISTORY-PART-${suffix}`,
        }),
      );

    const older =
      await adjustAdminProductInventory(
        product.id,
        {
          quantityDelta:
            5,
          note:
            `B17 history older ${suffix}`,
        },
      );

    assert.ok(
      older,
    );

    const newer =
      await adjustAdminProductInventory(
        product.id,
        {
          quantityDelta:
            -2,
          note:
            `B17 history newer ${suffix}`,
        },
      );

    assert.ok(
      newer,
    );

    const olderAt =
      new Date(
        '2026-09-02T10:00:00.000Z',
      );

    const newerAt =
      new Date(
        '2026-09-03T10:00:00.000Z',
      );

    await migrationSql`
      update inventory_movements
      set created_at =
        ${olderAt}
      where product_id =
        ${product.id}
        and note =
          ${`B17 history older ${suffix}`}
    `;

    await migrationSql`
      update inventory_movements
      set created_at =
        ${newerAt}
      where product_id =
        ${product.id}
        and note =
          ${`B17 history newer ${suffix}`}
    `;

    const movements =
      await listRecentAdminInventoryMovements();

    const matching =
      movements.filter(
        (movement) =>
          movement.productId ===
          product.id,
      );

    assert.equal(
      matching.length,
      2,
    );

    assert.equal(
      matching[0].productName,
      `B17 History Product ${suffix}`,
    );

    assert.equal(
      matching[0].partNumber,
      `B17-HISTORY-PART-${suffix}`,
    );

    assert.equal(
      matching[0].type,
      'adjustment',
    );

    assert.equal(
      matching[0].quantityDelta,
      -2,
    );

    assert.equal(
      matching[0].note,
      `B17 history newer ${suffix}`,
    );

    assert.equal(
      matching[0].createdAt.getTime(),
      newerAt.getTime(),
    );

    assert.equal(
      matching[1].quantityDelta,
      5,
    );

    assert.equal(
      matching[1].note,
      `B17 history older ${suffix}`,
    );

    assert.equal(
      matching[1].createdAt.getTime(),
      olderAt.getTime(),
    );
  },
);
test(
  'inventory repository summary counts physical out-of-stock products independently of list filters',
  async () => {
    const suffix =
      randomUUID();

    const before =
      await getAdminInventorySummary();

    await createOwnedProduct(
      createInput({
        suffix:
          `summary-zero-${suffix}`,
        name:
          `B17 Summary Zero ${suffix}`,
      }),
    );

    await createOwnedProduct(
      createInput({
        suffix:
          `summary-stock-${suffix}`,
        name:
          `B17 Summary Stock ${suffix}`,
      }),
      3,
    );

    const after =
      await getAdminInventorySummary();

    assert.equal(
      after.outOfStock,
      before.outOfStock + 1,
    );

    const filtered =
      await listAdminInventory({
        q:
          `B17 Summary Stock ${suffix}`,
        inventoryStatus:
          'in-stock',
        page:
          1,
        pageSize:
          25,
      });

    assert.equal(
      filtered.total,
      1,
    );

    const afterFilteredList =
      await getAdminInventorySummary();

    assert.equal(
      afterFilteredList.outOfStock,
      after.outOfStock,
    );
  },
);
