import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product mutation APIs keep locked contracts",
  async () => {
    const update =
      await fs.readFile(
        "src/pages/api/admin/products/[id].ts",
        "utf8",
      );

    const price =
      await fs.readFile(
        "src/pages/api/admin/products/[id]/price.ts",
        "utf8",
      );

    const inventory =
      await fs.readFile(
        "src/pages/api/admin/products/[id]/inventory.ts",
        "utf8",
      );


    // update product

    assert.match(
      update,
      /export const PATCH/,
    );

    assert.match(
      update,
      /resolveAdminApiSession/,
    );

    assert.match(
      update,
      /parseUpdateAdminProductInput/,
    );

    assert.match(
      update,
      /updateAdminProduct/,
    );

    assert.match(
      update,
      /invalid_session/,
    );

    assert.match(
      update,
      /invalid_json/,
    );

    assert.match(
      update,
      /invalid_product/,
    );

    assert.match(
      update,
      /product_conflict/,
    );

    assert.match(
      update,
      /ok:\s*true/,
    );

    assert.match(
      update,
      /product/,
    );


    // price mutation

    assert.match(
      price,
      /export const POST/,
    );

    assert.match(
      price,
      /parseSetAdminProductPriceInput/,
    );

    assert.match(
      price,
      /setAdminProductPrice/,
    );

    assert.match(
      price,
      /invalid_price/,
    );

    assert.match(
      price,
      /not_found/,
    );

    assert.match(
      price,
      /invalid_session/,
    );

    assert.match(
      price,
      /ok:\s*true/,
    );

    assert.match(
      price,
      /product/,
    );


    // inventory mutation

    assert.match(
      inventory,
      /export const POST/,
    );

    assert.match(
      inventory,
      /parseAdjustAdminProductInventoryInput/,
    );

    assert.match(
      inventory,
      /adjustAdminProductInventory/,
    );

    assert.match(
      inventory,
      /invalid_inventory_adjustment/,
    );

    assert.match(
      inventory,
      /inventory_conflict/,
    );

    assert.match(
      inventory,
      /not_found/,
    );

    assert.match(
      inventory,
      /invalid_session/,
    );

    assert.match(
      inventory,
      /ok:\s*true/,
    );

    assert.match(
      inventory,
      /product/,
    );
  },
);
