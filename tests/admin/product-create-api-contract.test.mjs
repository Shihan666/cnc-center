import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product create API keeps locked response contract",
  async () => {
    const api =
      await fs.readFile(
        "src/pages/api/admin/products/index.ts",
        "utf8",
      );

    assert.match(
      api,
      /export const POST/,
    );

    assert.match(
      api,
      /resolveAdminApiSession/,
    );

    assert.match(
      api,
      /invalid_session/,
    );

    assert.match(
      api,
      /invalid_json/,
    );

    assert.match(
      api,
      /invalid_product/,
    );

    assert.match(
      api,
      /product_conflict/,
    );

    assert.match(
      api,
      /createAdminProduct/,
    );

    assert.match(
      api,
      /status:\s*201/,
    );

    assert.match(
      api,
      /ok:\s*true/,
    );

    assert.match(
      api,
      /product/,
    );

    assert.match(
      api,
      /isAdminProductUniqueViolation/,
    );

    assert.match(
      api,
      /status:\s*409/,
    );

    assert.match(
      api,
      /status:\s*400/,
    );

    assert.match(
      api,
      /status:\s*401/,
    );
  },
);
