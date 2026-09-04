import assert from "node:assert/strict";
import {
  after,
  test,
} from "node:test";

process.loadEnvFile(
  ".env.local",
);

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required.",
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

const {
  closeDatabase,
} =
  await import(
    "../../src/server/db/client.ts"
  );

const {
  GET,
} =
  await import(
    "../../src/pages/api/admin/products/[id].ts"
  );

function createContext() {
  return {
    params: {
      id:
        "00000000-0000-0000-0000-000000000000",
    },

    request:
      new Request(
        "http://localhost:4321/api/admin/products/00000000-0000-0000-0000-000000000000",
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
  "admin product detail API requires an admin session",
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
  },
);
