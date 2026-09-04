import assert from "node:assert/strict";

import {
  after,
  before,
  test,
} from "node:test";

import postgres from "postgres";

process.loadEnvFile(
  ".env.local",
);

const testDatabaseUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for product repository tests.",
  );
}

const originalDatabaseUrl =
  process.env.DATABASE_URL;

if (
  originalDatabaseUrl?.trim() ===
  testDatabaseUrl
) {
  throw new Error(
    "TEST_DATABASE_URL must not equal DATABASE_URL.",
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

const [
  {
    closeDatabase,
  },
  {
    getAdminProductsSnapshot,
  },
] =
  await Promise.all([
    import(
      "../../src/server/db/client.ts"
    ),
    import(
      "../../src/server/products/repository.ts"
    ),
  ]);

const sql =
  postgres(
    testDatabaseUrl,
    {
      max: 2,
      prepare: false,
    },
  );

before(
  async () => {
    const [row] =
      await sql`
        select
          current_database()
            as database_name
      `;

    assert.ok(
      row.database_name,
    );
  },
);

after(
  async () => {
    await closeDatabase();

    await sql.end({
      timeout: 5,
    });

    if (
      originalDatabaseUrl ===
      undefined
    ) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL =
        originalDatabaseUrl;
    }
  },
);

test(
  "admin products repository returns the safe product snapshot",
  async () => {
    const products =
      await getAdminProductsSnapshot();

    assert.ok(
      Array.isArray(products),
    );

    for (const product of products) {
      assert.equal(
        "secretValue" in product,
        false,
      );

      assert.equal(
        "paymentKey" in product,
        false,
      );

      assert.equal(
        typeof product.name,
        "string",
      );

      assert.equal(
        typeof product.status,
        "string",
      );
    }
  },
);
