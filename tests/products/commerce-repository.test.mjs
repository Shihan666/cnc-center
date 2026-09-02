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
    'TEST_DATABASE_URL is required for commerce repository tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for commerce repository tests.',
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
  commerceRepository,
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/products/repository.ts'
    ),
    import(
      '../../src/server/products/commerce-repository.ts'
    ),
  ]);

const {
  getCommerceProductByContentId,
  getCommerceProductsByContentIds,
} = commerceRepository;

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
  contentId,
  commerceMode =
    'direct-purchase',
  priceVisibility =
    'visible',
  status =
    'active',
  priceRial =
    1_250_000,
} = {}) {
  const suffix =
    randomUUID();

  return {
    contentId:
      contentId ??
      `b12-commerce-${suffix}`,
    sku:
      `B12-SKU-${suffix}`,
    partNumber:
      `B12-PART-${suffix}`,
    name:
      'B12 Commerce Product',
    brand:
      'B12 Test Brand',
    manufacturer:
      null,
    condition:
      'new',
    commerceMode,
    priceVisibility,
    shippingClass:
      'standard',
    status,
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
  'commerce repository returns authoritative active product state by content id',
  async () => {
    const created =
      await createAdminProduct(
        createInput({
          contentId:
            'b12-public-motor',
        }),
      );

    ownedProductIds.add(
      created.id,
    );

    await adjustAdminProductInventory(
      created.id,
      {
        quantityDelta: 7,
        note:
          'B12 commerce test stock',
      },
    );

    const rows =
      await getCommerceProductsByContentIds(
        [
          'b12-public-motor',
        ],
      );

    assert.equal(
      rows.length,
      1,
    );

    assert.deepEqual(
      rows[0],
      {
        id:
          created.id,
        contentId:
          'b12-public-motor',

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
        currentPriceRial:
          1_250_000,
        onHand:
          7,
        reserved:
          0,
        available:
          7,
      },
    );
  },
);

test(
  'commerce repository preserves non-purchasable database state for callers to enforce',
  async () => {
    const created =
      await createAdminProduct(
        createInput({
          contentId:
            'b12-hidden-draft',
          commerceMode:
            'price-inquiry',
          priceVisibility:
            'hidden',
          status:
            'draft',
          priceRial:
            null,
        }),
      );

    ownedProductIds.add(
      created.id,
    );

    const rows =
      await getCommerceProductsByContentIds(
        [
          'b12-hidden-draft',
        ],
      );

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      rows[0].status,
      'draft',
    );

    assert.equal(
      rows[0].commerceMode,
      'price-inquiry',
    );

    assert.equal(
      rows[0].priceVisibility,
      'hidden',
    );

    assert.equal(
      rows[0].currentPriceRial,
      null,
    );

    assert.equal(
      rows[0].available,
      0,
    );
  },
);

test(
  'commerce repository ignores unknown content ids and de-duplicates requested ids',
  async () => {
    const created =
      await createAdminProduct(
        createInput({
          contentId:
            'b12-known-product',
        }),
      );

    ownedProductIds.add(
      created.id,
    );

    const rows =
      await getCommerceProductsByContentIds(
        [
          'b12-known-product',
          'missing-product',
          'b12-known-product',
        ],
      );

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      rows[0].contentId,
      'b12-known-product',
    );
  },
);

test(
  'commerce repository keeps price and inventory attached to each requested product',
  async () => {
    const first =
      await createAdminProduct(
        createInput({
          contentId:
            `commerce-multi-a-${randomUUID()}`,

          priceRial:
            1_111_000,
        }),
      );

    ownedProductIds.add(
      first.id,
    );

    await adjustAdminProductInventory(
      first.id,
      {
        quantityDelta:
          3,

        reason:
          'commerce multi-product test A',
      },
    );

    const second =
      await createAdminProduct(
        createInput({
          contentId:
            `commerce-multi-b-${randomUUID()}`,

          priceRial:
            9_999_000,
        }),
      );

    ownedProductIds.add(
      second.id,
    );

    await adjustAdminProductInventory(
      second.id,
      {
        quantityDelta:
          7,

        reason:
          'commerce multi-product test B',
      },
    );

    const states =
      await getCommerceProductsByContentIds(
        [
          first.contentId,
          second.contentId,
        ],
      );

    assert.equal(
      states.length,
      2,
    );

    const byContentId =
      new Map(
        states.map(
          (state) => [
            state.contentId,
            state,
          ],
        ),
      );

    assert.equal(
      byContentId.get(
        first.contentId,
      )?.currentPriceRial,
      1_111_000,
    );

    assert.equal(
      byContentId.get(
        first.contentId,
      )?.available,
      3,
    );

    assert.equal(
      byContentId.get(
        second.contentId,
      )?.currentPriceRial,
      9_999_000,
    );

    assert.equal(
      byContentId.get(
        second.contentId,
      )?.available,
      7,
    );
  },
);
test(
  'commerce repository returns an empty result without querying for empty input',
  async () => {
    assert.deepEqual(
      await getCommerceProductsByContentIds(
        [],
      ),
      [],
    );
  },
);
test(
  "commerce repository gets one product by content id",
  async () => {
    const contentId =
      `commerce-single-${randomUUID()}`;

    const created =
      await createAdminProduct(
        createInput({
          contentId,
          priceRial: 2345000,
        }),
      );

    ownedProductIds.add(
      created.id,
    );

    await adjustAdminProductInventory(
      created.id,
      {
        quantityDelta: 7,
        note:
          "commerce single lookup test",
      },
    );

    const state =
      await getCommerceProductByContentId(
        `  ${contentId}  `,
      );

    assert.ok(state);
    assert.equal(
      state.contentId,
      contentId,
    );
    assert.equal(
      state.currentPriceRial,
      2345000,
    );
    assert.equal(
      state.available,
      7,
    );
  },
);

test(
  "commerce repository returns null for empty or unknown content id",
  async () => {
    assert.equal(
      await getCommerceProductByContentId(
        "   ",
      ),
      null,
    );

    assert.equal(
      await getCommerceProductByContentId(
        `missing-${randomUUID()}`,
      ),
      null,
    );
  },
);
