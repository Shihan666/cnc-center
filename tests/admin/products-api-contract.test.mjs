import assert from "node:assert/strict";

import {
  after,
  before,
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
    runAuthTransaction,
  },
  {
    createAdminSessionTiming,
  },
  {
    generateOpaqueAuthToken,
    hashOpaqueAuthToken,
  },
  productModule,
] =
  await Promise.all([
    import(
      "../../src/server/db/client.ts"
    ),
    import(
      "../../src/server/auth/persistence.ts"
    ),
    import(
      "../../src/server/auth/service-foundation.ts"
    ),
    import(
      "../../src/server/auth/tokens.ts"
    ),
    import(
      "../../src/pages/api/admin/products/index.ts"
    ),
  ]);

const GET =
  productModule.GET;

const sql =
  (await import("postgres"))
    .default(
      testDatabaseUrl,
      {
        max: 2,
        prepare: false,
      },
    );

async function insertAdmin() {
  const now =
    new Date();

  const [row] =
    await sql`
      insert into admins (
        email,
        password_hash,
        is_active,
        password_changed_at,
        created_at,
        updated_at
      )
      values (
        ${`b21-products-${crypto.randomUUID()}@test.local`},
        ${"hash"},
        true,
        ${now},
        ${now},
        ${now}
      )
      returning id
    `;

  return row.id;
}

async function insertSession(
  adminId,
) {
  const token =
    generateOpaqueAuthToken();

  await runAuthTransaction(
    (tx) =>
      tx.insertAdminSession({
        adminId,
        tokenHash:
          hashOpaqueAuthToken(
            token,
          ),
        authMethod:
          "totp",
        timing:
          createAdminSessionTiming(
            new Date(),
          ),
      }),
  );

  return token;
}

function createContext(
  sessionToken,
) {
  return {
    request:
      new Request(
        "http://localhost:4321/api/admin/products",
      ),

    cookies: {
      get() {
        return {
          value:
            sessionToken,
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

before(
  async () => {
    const [row] =
      await sql`
        select current_database()
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
  "admin products API returns only the safe product contract",
  async () => {
    const adminId =
      await insertAdmin();

    const sessionToken =
      await insertSession(
        adminId,
      );

    const response =
      await GET(
        createContext(
          sessionToken,
        ),
      );

    assert.equal(
      response.status,
      200,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      true,
    );

    assert.ok(
      Array.isArray(
        body.products,
      ),
    );

    for (const product of body.products) {
      assert.equal(
        "secretValue" in product,
        false,
      );

      assert.equal(
        "paymentKey" in product,
        false,
      );
    }
  },
);
