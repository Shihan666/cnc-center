import assert from "node:assert/strict";

import {
  after,
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
    "TEST_DATABASE_URL is required for order detail read model tests.",
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
    getAdminOrderDetailSnapshot,
  },
] =
  await Promise.all([
    import(
      "../../src/server/db/client.ts"
    ),

    import(
      "../../src/server/orders/admin-detail-read-model.ts"
    ),
  ]);

const sql =
  postgres(
    testDatabaseUrl,
    {
      max: 2,
    },
  );

test(
  "admin order detail read model exposes only the locked safe order shape",
  async () => {
    const order =
      await getAdminOrderDetailSnapshot(
        "00000000-0000-0000-0000-000000000000",
      );

    assert.equal(
      order,
      null,
    );

    if (order) {
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
    }
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
