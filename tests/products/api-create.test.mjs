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
    'TEST_DATABASE_URL is required for product create API tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for product create API tests.',
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
  productIndexModule,
  productDetailModule,
  productPriceModule,
  productInventoryModule,
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
      '../../src/pages/api/admin/products/index.ts'
    ),
    import(
      '../../src/pages/api/admin/products/[id].ts'
    ),
    import(
      '../../src/pages/api/admin/products/[id]/price.ts'
    ),
    import(
      '../../src/pages/api/admin/products/[id]/inventory.ts'
    ),
  ]);

const GET_LIST =
  productIndexModule.GET;

const POST =
  productIndexModule.POST;

const GET_DETAIL =
  productDetailModule.GET;

const PATCH_DETAIL =
  productDetailModule.PATCH;

const POST_PRICE =
  productPriceModule.POST;

const POST_INVENTORY =
  productInventoryModule.POST;

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

const ownedAdminIds =
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

async function insertAdmin() {
  const now =
    new Date();

  const [row] =
    await migrationSql`
      insert into admins (
        email,
        password_hash,
        is_active,
        password_changed_at,
        created_at,
        updated_at
      )
      values (
        ${`product-api-${randomUUID()}@test.local`},
        ${'product-api-test-password-hash'},
        ${true},
        ${now},
        ${now},
        ${now}
      )
      returning
        id
    `;

  assert.ok(row);

  ownedAdminIds.add(
    row.id,
  );

  return row.id;
}

async function insertSession(
  adminId,
) {
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
        adminId,
        tokenHash,
        authMethod:
          'totp',
        timing,
      }),
  );

  return sessionToken;
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

  ownedProductIds.clear();
  ownedAdminIds.clear();
}

function createProductInput() {
  const suffix =
    randomUUID();

  return {
    contentId:
      `b11-api-product-${suffix}`,
    sku:
      `B11-API-${suffix}`,
    partNumber:
      `B11-API-PART-${suffix}`,
    name:
      'B11 API Product',
    brand:
      'B11 API Brand',
    manufacturer:
      'B11 API Manufacturer',
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

function createContext({
  sessionToken,
  body,
  contentType =
    'application/json',
  origin =
    'http://localhost:4321',
}) {
  const cookies = {
    get(
      name,
    ) {
      assert.equal(
        name,
        'cnc_admin_session',
      );

      return sessionToken ===
        undefined
        ? undefined
        : {
            value:
              sessionToken,
          };
    },

    delete() {},
  };

  const headers = {};

  if (contentType !== null) {
    headers['content-type'] =
      contentType;
  }

  if (origin !== null) {
    headers.origin =
      origin;
  }

  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/products',
        {
          method:
            'POST',
          headers,
          body:
            body === undefined
              ? undefined
              : JSON.stringify(
                  body,
                ),
        },
      ),

    params: {},

    site:
      new URL(
        'http://localhost:4321',
      ),

    cookies,
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
  'product create API rejects a non-JSON request before authentication',
  async () => {
    const response =
      await POST(
        createContext({
          sessionToken:
            undefined,
          body:
            createProductInput(),
          contentType:
            'text/plain',
        }),
      );

    assert.equal(
      response.status,
      415,
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'unsupported_media_type',
      },
    );
  },
);

test(
  'product create API rejects a cross-origin request before authentication',
  async () => {
    const response =
      await POST(
        createContext({
          sessionToken:
            undefined,
          body:
            createProductInput(),
          origin:
            'https://example.test',
        }),
      );

    assert.equal(
      response.status,
      403,
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'forbidden',
      },
    );
  },
);

test(
  'product create API rejects an unauthenticated same-origin request',
  async () => {
    const response =
      await POST(
        createContext({
          sessionToken:
            undefined,
          body:
            createProductInput(),
        }),
      );

    assert.equal(
      response.status,
      401,
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'invalid_session',
      },
    );
  },
);

test(
  'product create API creates a product with a real admin session',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const input =
      createProductInput();

    const response =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
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

    assert.ok(
      body.product?.id,
    );

    ownedProductIds.add(
      body.product.id,
    );

    assert.equal(
      body.product.contentId,
      input.contentId,
    );

    assert.equal(
      body.product.currentPriceRial,
      input.priceRial,
    );

    assert.equal(
      body.product.onHand,
      0,
    );

    assert.equal(
      body.product.reserved,
      0,
    );

    assert.equal(
      body.product.available,
      0,
    );
  },
);
test(
  'product detail API returns authoritative detail and treats malformed ids as not found',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const input =
      createProductInput();

    const createResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
        }),
      );

    assert.equal(
      createResponse.status,
      201,
    );

    const createBody =
      await createResponse.json();

    assert.equal(
      createBody.ok,
      true,
    );

    const productId =
      createBody.product.id;

    ownedProductIds.add(
      productId,
    );

    const detailContext = {
      ...createContext({
        sessionToken,
        body:
          undefined,
      }),
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${productId}`,
          {
            method:
              'GET',
          },
        ),
      params: {
        id:
          productId,
      },
    };

    const response =
      await GET_DETAIL(
        detailContext,
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      body.product.id,
      productId,
    );

    assert.equal(
      body.product.contentId,
      input.contentId,
    );

    assert.equal(
      body.product.currentPriceRial,
      input.priceRial,
    );

    assert.equal(
      body.product.onHand,
      0,
    );

    assert.equal(
      body.product.reserved,
      0,
    );

    assert.equal(
      body.product.available,
      0,
    );

    assert.equal(
      JSON.stringify(
        body,
      ).includes(
        sessionToken,
      ),
      false,
    );

    const malformedContext = {
      ...detailContext,
      request:
        new Request(
          'http://localhost:4321/api/admin/products/not-a-uuid',
          {
            method:
              'GET',
          },
        ),
      params: {
        id:
          'not-a-uuid',
      },
    };

    const malformedResponse =
      await GET_DETAIL(
        malformedContext,
      );

    assert.equal(
      malformedResponse.status,
      404,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'not_found',
      },
    );
  },
);
test(
  'product PATCH API updates metadata without changing commerce state',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const input =
      createProductInput();

    const createResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
        }),
      );

    assert.equal(
      createResponse.status,
      201,
    );

    const createBody =
      await createResponse.json();

    assert.equal(
      createBody.ok,
      true,
    );

    const productId =
      createBody.product.id;

    ownedProductIds.add(
      productId,
    );

    const updateInput = {
      contentId:
        `${input.contentId}-updated`,
      sku:
        null,
      partNumber:
        `${input.partNumber}-UPDATED`,
      name:
        'Updated B11 API Product',
      brand:
        'Updated B11 Brand',
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
        'draft',
    };

    const patchContext = {
      ...createContext({
        sessionToken,
        body:
          updateInput,
      }),
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${productId}`,
          {
            method:
              'PATCH',
            headers: {
              'content-type':
                'application/json',
              origin:
                'http://localhost:4321',
            },
            body:
              JSON.stringify(
                updateInput,
              ),
          },
        ),
      params: {
        id:
          productId,
      },
    };

    const response =
      await PATCH_DETAIL(
        patchContext,
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      body.product.id,
      productId,
    );

    assert.equal(
      body.product.contentId,
      updateInput.contentId,
    );

    assert.equal(
      body.product.sku,
      null,
    );

    assert.equal(
      body.product.name,
      updateInput.name,
    );

    assert.equal(
      body.product.brand,
      updateInput.brand,
    );

    assert.equal(
      body.product.manufacturer,
      null,
    );

    assert.equal(
      body.product.condition,
      'tested',
    );

    assert.equal(
      body.product.commerceMode,
      'price-inquiry',
    );

    assert.equal(
      body.product.priceVisibility,
      'hidden',
    );

    assert.equal(
      body.product.status,
      'draft',
    );

    assert.equal(
      body.product.currentPriceRial,
      input.priceRial,
    );

    assert.equal(
      body.product.onHand,
      0,
    );

    assert.equal(
      body.product.reserved,
      0,
    );

    assert.equal(
      body.product.available,
      0,
    );

    const malformedContext = {
      ...patchContext,
      request:
        new Request(
          'http://localhost:4321/api/admin/products/not-a-uuid',
          {
            method:
              'PATCH',
            headers: {
              'content-type':
                'application/json',
              origin:
                'http://localhost:4321',
            },
            body:
              JSON.stringify(
                updateInput,
              ),
          },
        ),
      params: {
        id:
          'not-a-uuid',
      },
    };

    const malformedResponse =
      await PATCH_DETAIL(
        malformedContext,
      );

    assert.equal(
      malformedResponse.status,
      404,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'not_found',
      },
    );
  },
);
test(
  'product price API updates current price and rejects invalid input',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const input =
      createProductInput();

    const createResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
        }),
      );

    assert.equal(
      createResponse.status,
      201,
    );

    const createBody =
      await createResponse.json();

    const productId =
      createBody.product.id;

    ownedProductIds.add(
      productId,
    );

    const nextPrice =
      input.priceRial + 250_000;

    const priceBody = {
      amountRial:
        nextPrice,
    };

    const createPriceContext =
      (id, body) => ({
        ...createContext({
          sessionToken,
          body,
        }),
        request:
          new Request(
            `http://localhost:4321/api/admin/products/${id}/price`,
            {
              method:
                'POST',
              headers: {
                'content-type':
                  'application/json',
                origin:
                  'http://localhost:4321',
              },
              body:
                JSON.stringify(
                  body,
                ),
            },
          ),
        params: {
          id,
        },
      });

    const response =
      await POST_PRICE(
        createPriceContext(
          productId,
          priceBody,
        ),
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      body.product.id,
      productId,
    );

    assert.equal(
      body.product.currentPriceRial,
      nextPrice,
    );

    assert.equal(
      body.product.contentId,
      input.contentId,
    );

    assert.equal(
      body.product.onHand,
      0,
    );

    assert.equal(
      body.product.reserved,
      0,
    );

    assert.equal(
      body.product.available,
      0,
    );

    const invalidResponse =
      await POST_PRICE(
        createPriceContext(
          productId,
          {
            amountRial:
              -1,
          },
        ),
      );

    assert.equal(
      invalidResponse.status,
      400,
    );

    assert.deepEqual(
      await invalidResponse.json(),
      {
        ok: false,
        reason:
          'invalid_price',
      },
    );

    const malformedResponse =
      await POST_PRICE(
        createPriceContext(
          'not-a-uuid',
          {
            amountRial:
              nextPrice,
          },
        ),
      );

    assert.equal(
      malformedResponse.status,
      404,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'not_found',
      },
    );

    const detailContext = {
      ...createContext({
        sessionToken,
        body:
          undefined,
      }),
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${productId}`,
          {
            method:
              'GET',
          },
        ),
      params: {
        id:
          productId,
      },
    };

    const detailResponse =
      await GET_DETAIL(
        detailContext,
      );

    assert.equal(
      detailResponse.status,
      200,
    );

    const detailBody =
      await detailResponse.json();

    assert.equal(
      detailBody.product.currentPriceRial,
      nextPrice,
    );
  },
);
test(
  'product inventory API adjusts stock and rejects invalid or conflicting adjustments',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const input =
      createProductInput();

    const createResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
        }),
      );

    assert.equal(
      createResponse.status,
      201,
    );

    const createBody =
      await createResponse.json();

    const productId =
      createBody.product.id;

    ownedProductIds.add(
      productId,
    );

    const createInventoryContext =
      (id, body) => ({
        ...createContext({
          sessionToken,
          body,
        }),
        request:
          new Request(
            `http://localhost:4321/api/admin/products/${id}/inventory`,
            {
              method:
                'POST',
              headers: {
                'content-type':
                  'application/json',
                origin:
                  'http://localhost:4321',
              },
              body:
                JSON.stringify(
                  body,
                ),
            },
          ),
        params: {
          id,
        },
      });

    const response =
      await POST_INVENTORY(
        createInventoryContext(
          productId,
          {
            quantityDelta:
              8,
            note:
              'API inventory adjustment',
          },
        ),
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      body.product.id,
      productId,
    );

    assert.equal(
      body.product.onHand,
      8,
    );

    assert.equal(
      body.product.reserved,
      0,
    );

    assert.equal(
      body.product.available,
      8,
    );

    assert.equal(
      body.product.currentPriceRial,
      input.priceRial,
    );

    const invalidResponse =
      await POST_INVENTORY(
        createInventoryContext(
          productId,
          {
            quantityDelta:
              0,
            note:
              null,
          },
        ),
      );

    assert.equal(
      invalidResponse.status,
      400,
    );

    assert.deepEqual(
      await invalidResponse.json(),
      {
        ok: false,
        reason:
          'invalid_inventory_adjustment',
      },
    );

    const conflictResponse =
      await POST_INVENTORY(
        createInventoryContext(
          productId,
          {
            quantityDelta:
              -9,
            note:
              'Must fail atomically',
          },
        ),
      );

    assert.equal(
      conflictResponse.status,
      409,
    );

    assert.deepEqual(
      await conflictResponse.json(),
      {
        ok: false,
        reason:
          'inventory_conflict',
      },
    );

    const malformedResponse =
      await POST_INVENTORY(
        createInventoryContext(
          'not-a-uuid',
          {
            quantityDelta:
              1,
            note:
              null,
          },
        ),
      );

    assert.equal(
      malformedResponse.status,
      404,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'not_found',
      },
    );

    const detailContext = {
      ...createContext({
        sessionToken,
        body:
          undefined,
      }),
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${productId}`,
          {
            method:
              'GET',
          },
        ),
      params: {
        id:
          productId,
      },
    };

    const detailResponse =
      await GET_DETAIL(
        detailContext,
      );

    assert.equal(
      detailResponse.status,
      200,
    );

    const detailBody =
      await detailResponse.json();

    assert.equal(
      detailBody.product.onHand,
      8,
    );

    assert.equal(
      detailBody.product.reserved,
      0,
    );

    assert.equal(
      detailBody.product.available,
      8,
    );
  },
);
test(
  'product list API requires authentication and returns authoritative commerce data',
  async () => {
    const unauthenticatedContext = {
      ...createContext({
        body:
          undefined,
      }),
      request:
        new Request(
          'http://localhost:4321/api/admin/products',
          {
            method:
              'GET',
          },
        ),
    };

    const unauthenticatedResponse =
      await GET_LIST(
        unauthenticatedContext,
      );

    assert.equal(
      unauthenticatedResponse.status,
      401,
    );

    assert.deepEqual(
      await unauthenticatedResponse.json(),
      {
        ok: false,
        reason:
          'invalid_session',
      },
    );

    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const input =
      createProductInput();

    const createResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
        }),
      );

    assert.equal(
      createResponse.status,
      201,
    );

    const createBody =
      await createResponse.json();

    const productId =
      createBody.product.id;

    ownedProductIds.add(
      productId,
    );

    const inventoryBody = {
      quantityDelta:
        6,
      note:
        'List API verification',
    };

    const inventoryContext = {
      ...createContext({
        sessionToken,
        body:
          inventoryBody,
      }),
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${productId}/inventory`,
          {
            method:
              'POST',
            headers: {
              'content-type':
                'application/json',
              origin:
                'http://localhost:4321',
            },
            body:
              JSON.stringify(
                inventoryBody,
              ),
          },
        ),
      params: {
        id:
          productId,
      },
    };

    const inventoryResponse =
      await POST_INVENTORY(
        inventoryContext,
      );

    assert.equal(
      inventoryResponse.status,
      200,
    );

    const authenticatedContext = {
      ...createContext({
        sessionToken,
        body:
          undefined,
      }),
      request:
        new Request(
          'http://localhost:4321/api/admin/products',
          {
            method:
              'GET',
          },
        ),
    };

    const response =
      await GET_LIST(
        authenticatedContext,
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.equal(
      Array.isArray(
        body.products,
      ),
      true,
    );

    const product =
      body.products.find(
        (candidate) =>
          candidate.id ===
          productId,
      );

    assert.ok(
      product,
    );

    assert.equal(
      product.contentId,
      input.contentId,
    );

    assert.equal(
      product.name,
      input.name,
    );

    assert.equal(
      product.currentPriceRial,
      input.priceRial,
    );

    assert.equal(
      product.onHand,
      6,
    );

    assert.equal(
      product.reserved,
      0,
    );

    assert.equal(
      product.available,
      6,
    );

    assert.equal(
      JSON.stringify(
        body,
      ).includes(
        sessionToken,
      ),
      false,
    );
  },
);
test(
  'product create API rejects malformed invalid and conflicting products',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const baseContext =
      createContext({
        sessionToken,
        body:
          undefined,
      });

    const malformedContext = {
      ...baseContext,
      request:
        new Request(
          'http://localhost:4321/api/admin/products',
          {
            method:
              'POST',
            headers: {
              'content-type':
                'application/json',
              origin:
                'http://localhost:4321',
            },
            body:
              '{"contentId":',
          },
        ),
    };

    const malformedResponse =
      await POST(
        malformedContext,
      );

    assert.equal(
      malformedResponse.status,
      400,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'invalid_json',
      },
    );

    const input =
      createProductInput();

    const invalidResponse =
      await POST(
        createContext({
          sessionToken,
          body: {
            ...input,
            status:
              'not-a-product-status',
          },
        }),
      );

    assert.equal(
      invalidResponse.status,
      400,
    );

    assert.deepEqual(
      await invalidResponse.json(),
      {
        ok: false,
        reason:
          'invalid_product',
      },
    );

    const firstResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            input,
        }),
      );

    assert.equal(
      firstResponse.status,
      201,
    );

    const firstBody =
      await firstResponse.json();

    assert.equal(
      firstBody.ok,
      true,
    );

    ownedProductIds.add(
      firstBody.product.id,
    );

    const conflictingInput = {
      ...createProductInput(),
      contentId:
        input.contentId,
    };

    const conflictResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            conflictingInput,
        }),
      );

    assert.equal(
      conflictResponse.status,
      409,
    );

    assert.deepEqual(
      await conflictResponse.json(),
      {
        ok: false,
        reason:
          'product_conflict',
      },
    );
  },
);
test(
  'product PATCH API rejects malformed invalid and conflicting updates',
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const firstInput =
      createProductInput();

    const secondInput =
      createProductInput();

    const firstResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            firstInput,
        }),
      );

    assert.equal(
      firstResponse.status,
      201,
    );

    const firstBody =
      await firstResponse.json();

    const firstProductId =
      firstBody.product.id;

    ownedProductIds.add(
      firstProductId,
    );

    const secondResponse =
      await POST(
        createContext({
          sessionToken,
          body:
            secondInput,
        }),
      );

    assert.equal(
      secondResponse.status,
      201,
    );

    const secondBody =
      await secondResponse.json();

    const secondProductId =
      secondBody.product.id;

    ownedProductIds.add(
      secondProductId,
    );

    const createPatchContext =
      (id, body) => ({
        ...createContext({
          sessionToken,
          body,
        }),
        request:
          new Request(
            `http://localhost:4321/api/admin/products/${id}`,
            {
              method:
                'PATCH',
              headers: {
                'content-type':
                  'application/json',
                origin:
                  'http://localhost:4321',
              },
              body:
                JSON.stringify(
                  body,
                ),
            },
          ),
        params: {
          id,
        },
      });

    const malformedBase =
      createContext({
        sessionToken,
        body:
          undefined,
      });

    const malformedContext = {
      ...malformedBase,
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${firstProductId}`,
          {
            method:
              'PATCH',
            headers: {
              'content-type':
                'application/json',
              origin:
                'http://localhost:4321',
            },
            body:
              '{"contentId":',
          },
        ),
      params: {
        id:
          firstProductId,
      },
    };

    const malformedResponse =
      await PATCH_DETAIL(
        malformedContext,
      );

    assert.equal(
      malformedResponse.status,
      400,
    );

    assert.deepEqual(
      await malformedResponse.json(),
      {
        ok: false,
        reason:
          'invalid_json',
      },
    );

    const invalidInput = {
      contentId:
        firstInput.contentId,
      sku:
        firstInput.sku,
      partNumber:
        firstInput.partNumber,
      name:
        firstInput.name,
      brand:
        firstInput.brand,
      manufacturer:
        firstInput.manufacturer,
      condition:
        firstInput.condition,
      commerceMode:
        firstInput.commerceMode,
      priceVisibility:
        firstInput.priceVisibility,
      shippingClass:
        firstInput.shippingClass,
      status:
        'not-a-product-status',
    };

    const invalidResponse =
      await PATCH_DETAIL(
        createPatchContext(
          firstProductId,
          invalidInput,
        ),
      );

    assert.equal(
      invalidResponse.status,
      400,
    );

    assert.deepEqual(
      await invalidResponse.json(),
      {
        ok: false,
        reason:
          'invalid_product',
      },
    );

    const conflictingInput = {
      contentId:
        firstInput.contentId,
      sku:
        secondInput.sku,
      partNumber:
        secondInput.partNumber,
      name:
        secondInput.name,
      brand:
        secondInput.brand,
      manufacturer:
        secondInput.manufacturer,
      condition:
        secondInput.condition,
      commerceMode:
        secondInput.commerceMode,
      priceVisibility:
        secondInput.priceVisibility,
      shippingClass:
        secondInput.shippingClass,
      status:
        secondInput.status,
    };

    const conflictResponse =
      await PATCH_DETAIL(
        createPatchContext(
          secondProductId,
          conflictingInput,
        ),
      );

    assert.equal(
      conflictResponse.status,
      409,
    );

    assert.deepEqual(
      await conflictResponse.json(),
      {
        ok: false,
        reason:
          'product_conflict',
      },
    );

    const detailContext = {
      ...createContext({
        sessionToken,
        body:
          undefined,
      }),
      request:
        new Request(
          `http://localhost:4321/api/admin/products/${secondProductId}`,
          {
            method:
              'GET',
          },
        ),
      params: {
        id:
          secondProductId,
      },
    };

    const detailResponse =
      await GET_DETAIL(
        detailContext,
      );

    assert.equal(
      detailResponse.status,
      200,
    );

    const detailBody =
      await detailResponse.json();

    assert.equal(
      detailBody.product.contentId,
      secondInput.contentId,
    );

    assert.equal(
      detailBody.product.sku,
      secondInput.sku,
    );
  },
);