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
    "TEST_DATABASE_URL is required for orders read model tests.",
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
    getAdminOrdersSnapshot,
  },
] =
  await Promise.all([
    import(
      "../../src/server/db/client.ts"
    ),
    import(
      "../../src/server/orders/admin-read-model.ts"
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
      originalDatabaseUrl === undefined
    ) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL =
        originalDatabaseUrl;
    }
  },
);

test(
  "admin orders read model exposes only the locked safe order shape",
  async () => {
    const result =
      await getAdminOrdersSnapshot({
        page: 1,
        pageSize: 10,
        q: "",
        status: null,
      });

    assert.ok(
      Array.isArray(
        result.items,
      ),
    );

    for (const order of result.items) {
      assert.equal(
        "paymentRuntimeConfig" in order,
        false,
      );

      assert.equal(
        "secretValue" in order,
        false,
      );

      assert.equal(
        typeof order.id,
        "string",
      );

      assert.equal(
        typeof order.status,
        "string",
      );
    }
  },
);
