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
    'TEST_DATABASE_URL is required for inventory API integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for inventory API integration tests.',
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
    runAuthTransaction,
  },
  {
    createAdminSessionTiming,
  },
  {
    generateOpaqueAuthToken,
    hashOpaqueAuthToken,
  },
  {
    adjustAdminProductInventory,
    createAdminProduct,
  },
  {
    GET:
      getInventoryList,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/auth/persistence.ts'
    ),
    import(
      '../../src/server/auth/service-foundation.ts'
    ),
    import(
      '../../src/server/auth/tokens.ts'
    ),
    import(
      '../../src/server/products/repository.ts'
    ),
    import(
      '../../src/pages/api/admin/inventory/index.ts'
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

const ownedAdminIds =
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

async function insertAdmin() {
  const id =
    randomUUID();

  const now =
    new Date();

  const email =
    `b17-inventory-api-${id}@example.test`;

  await migrationSql`
    insert into admins (
      id,
      email,
      password_hash,
      is_active,
      password_changed_at,
      created_at,
      updated_at
    )
    values (
      ${id},
      ${email},
      ${'b17-inventory-api-test-password-hash'},
      ${true},
      ${now},
      ${now},
      ${now}
    )
  `;

  ownedAdminIds.add(
    id,
  );

  return {
    id,
    email,
  };
}

async function createValidAdminSession() {
  const admin =
    await insertAdmin();

  const sessionToken =
    generateOpaqueAuthToken();

  const tokenHash =
    hashOpaqueAuthToken(
      sessionToken,
    );

  const timing =
    createAdminSessionTiming(
      new Date(),
    );

  await runAuthTransaction(
    (tx) =>
      tx.insertAdminSession({
        adminId:
          admin.id,

        tokenHash,

        authMethod:
          'totp',

        timing,
      }),
  );

  return {
    admin,
    sessionToken,
  };
}

function createProductInput({
  suffix,
  name,
} = {}) {
  const uniqueSuffix =
    suffix ??
    randomUUID();

  return {
    contentId:
      `b17-inventory-api-${uniqueSuffix}`,
    sku:
      `B17-API-SKU-${uniqueSuffix}`,
    partNumber:
      `B17-API-PART-${uniqueSuffix}`,
    name:
      name ??
      `B17 Inventory API Product ${uniqueSuffix}`,
    brand:
      'B17 API Brand',
    manufacturer:
      'B17 API Manufacturer',
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
      2_000_000,
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
            'B17 inventory API test',
        },
      );

    assert.ok(adjusted);

    return adjusted;
  }

  return product;
}

function createCookies(
  sessionToken,
) {
  const deleteCalls = [];

  return {
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        assert.equal(
          name,
          'cnc_admin_session',
        );

        if (
          sessionToken ===
          undefined
        ) {
          return undefined;
        }

        return {
          value:
            sessionToken,
        };
      },

      set() {
        throw new Error(
          'Unexpected cookie set.',
        );
      },

      delete(
        name,
        options,
      ) {
        deleteCalls.push({
          name,
          options,
        });
      },
    },
  };
}

function createContext({
  pathname,
  sessionToken,
}) {
  const recorder =
    createCookies(
      sessionToken,
    );

  const url =
    new URL(
      `http://localhost:4321${pathname}`,
    );

  return {
    recorder,

    context: {
      url,

      request:
        new Request(
          url,
          {
            method:
              'GET',
          },
        ),

      cookies:
        recorder.cookies,

      site:
        new URL(
          'http://localhost:4321',
        ),

      params: {},
      locals: {},
    },
  };
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

  for (
    const adminId of
    ownedAdminIds
  ) {
    await migrationSql`
      delete
      from admin_sessions
      where admin_id =
        ${adminId}
    `;

    await migrationSql`
      delete
      from admins
      where id =
        ${adminId}
    `;
  }

  ownedAdminIds.clear();
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
  'inventory list API requires an admin session and clears a missing session cookie',
  async () => {
    const {
      context,
      recorder,
    } =
      createContext({
        pathname:
          '/api/admin/inventory',

        sessionToken:
          undefined,
      });

    const response =
      await getInventoryList(
        context,
      );

    assert.equal(
      response.status,
      401,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'invalid_session',
      },
    );

    assert.equal(
      recorder.deleteCalls.length,
      1,
    );

    assert.equal(
      recorder.deleteCalls[0].name,
      'cnc_admin_session',
    );
  },
);

test(
  'inventory list API returns authoritative filtered inventory data for a valid admin session',
  async () => {
    const {
      sessionToken,
    } =
      await createValidAdminSession();

    const suffix =
      randomUUID();

    const stocked =
      await createOwnedProduct(
        createProductInput({
          suffix:
            `stock-${suffix}`,
          name:
            `B17 API Search ${suffix}`,
        }),
        6,
      );

    await createOwnedProduct(
      createProductInput({
        suffix:
          `zero-${suffix}`,
        name:
          `B17 API Search ${suffix} Zero`,
      }),
    );

    const {
      context,
      recorder,
    } =
      createContext({
        pathname:
          `/api/admin/inventory?q=%20B17%20API%20Search%20${suffix}%20&inventoryStatus=in-stock&page=1&pageSize=10`,

        sessionToken,
      });

    const response =
      await getInventoryList(
        context,
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.deepEqual(
      body.query,
      {
        q:
          `B17 API Search ${suffix}`,
        inventoryStatus:
          'in-stock',
        page:
          1,
        pageSize:
          10,
      },
    );

    assert.equal(
      body.pagination.total,
      1,
    );

    assert.equal(
      body.pagination.page,
      1,
    );

    assert.equal(
      body.pagination.pageSize,
      10,
    );

    assert.equal(
      body.pagination.totalPages,
      1,
    );

    assert.equal(
      typeof body.summary,
      'object',
    );

    assert.equal(
      typeof body.summary.outOfStock,
      'number',
    );

    assert.ok(
      body.summary.outOfStock >=
        1,
    );

    assert.equal(
      body.inventory.length,
      1,
    );

    assert.equal(
      body.inventory[0].productId,
      stocked.id,
    );

    assert.equal(
      body.inventory[0].onHand,
      6,
    );

    assert.equal(
      body.inventory[0].reserved,
      0,
    );

    assert.equal(
      body.inventory[0].available,
      6,
    );

    assert.ok(
      Array.isArray(
        body.movements,
      ),
    );

    const stockedMovement =
      body.movements.find(
        (movement) =>
          movement.productId ===
          stocked.id,
      );

    assert.ok(
      stockedMovement,
    );

    assert.equal(
      stockedMovement.productName,
      `B17 API Search ${suffix}`,
    );

    assert.equal(
      stockedMovement.type,
      'adjustment',
    );

    assert.equal(
      stockedMovement.quantityDelta,
      6,
    );

    assert.equal(
      stockedMovement.note,
      'B17 inventory API test',
    );

    assert.equal(
      typeof stockedMovement.createdAt,
      'string',
    );
  },
);
