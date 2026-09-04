import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product mutation APIs keep locked response contracts",
  async () => {
    const detailApi =
      await fs.readFile(
        "src/pages/api/admin/products/[id].ts",
        "utf8",
      );

    const priceApi =
      await fs.readFile(
        "src/pages/api/admin/products/[id]/price.ts",
        "utf8",
      );

    const inventoryApi =
      await fs.readFile(
        "src/pages/api/admin/products/[id]/inventory.ts",
        "utf8",
      );

    assert.match(
      detailApi,
      /export const PATCH/,
    );

    assert.match(
      detailApi,
      /ok:\s*true/,
    );

    assert.match(
      detailApi,
      /product/,
    );

    assert.match(
      detailApi,
      /invalid_product/,
    );

    assert.match(
      detailApi,
      /product_conflict/,
    );


    assert.match(
      priceApi,
      /export const POST/,
    );

    assert.match(
      priceApi,
      /ok:\s*true/,
    );

    assert.match(
      priceApi,
      /product/,
    );

    assert.match(
      priceApi,
      /invalid_price/,
    );


    assert.match(
      inventoryApi,
      /export const POST/,
    );

    assert.match(
      inventoryApi,
      /ok:\s*true/,
    );

    assert.match(
      inventoryApi,
      /product/,
    );

    assert.match(
      inventoryApi,
      /invalid_inventory_adjustment/,
    );

    assert.match(
      inventoryApi,
      /inventory_conflict/,
    );
  },
);
