import assert from "node:assert/strict";

import {
  after,
  test,
} from "node:test";

process.loadEnvFile(
  ".env.local",
);

const testDatabaseUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required.",
  );
}

const originalDatabaseUrl =
  process.env.DATABASE_URL;

process.env.DATABASE_URL =
  testDatabaseUrl;

const [
  {
    closeDatabase,
  },
  {
    GET,
  },
] =
  await Promise.all([
    import(
      "../../src/server/db/client.ts"
    ),

    import(
      "../../src/pages/api/admin/orders/[id].ts"
    ),
  ]);

function createContext() {
  return {
    params: {
      id:
        "00000000-0000-0000-0000-000000000000",
    },

    request:
      new Request(
        "http://localhost:4321/api/admin/orders/00000000-0000-0000-0000-000000000000",
      ),

    cookies: {
      get() {
        return {
          value:
            "invalid-session",
        };
      },

      delete() {},
    },

    site:
      new URL(
        "http://localhost:4321",
      ),
  };
}

test(
  "admin order detail API exposes only the safe contract",
  async () => {
    const response =
      await GET(
        createContext(),
      );

    assert.equal(
      response.status,
      401,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      false,
    );

    assert.equal(
      body.reason,
      "invalid_session",
    );
  },
);

after(
  async () => {
    await closeDatabase();

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
