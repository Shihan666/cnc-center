import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product UI workflows keep locked contracts",
  async () => {

    const list =
      await fs.readFile(
        "src/pages/admin/products/index.astro",
        "utf8",
      );

    const create =
      await fs.readFile(
        "src/pages/admin/products/new.astro",
        "utf8",
      );

    const detail =
      await fs.readFile(
        "src/pages/admin/products/[id].astro",
        "utf8",
      );


    // list page

    assert.match(
      list,
      /\/api\/admin\/products/,
    );

    assert.match(
      list,
      /\/admin\/products\/new/,
    );

    assert.match(
      list,
      /\/admin\/products\/\$\{encodeURIComponent\(product\.id\)\}/,
    );


    // create page

    assert.match(
      create,
      /create-product-form/,
    );

    assert.match(
      create,
      /POST/,
    );

    assert.match(
      create,
      /\/api\/admin\/products/,
    );

    assert.match(
      create,
      /product_conflict/,
    );

    assert.match(
      create,
      /invalid_product/,
    );

    assert.match(
      create,
      /result\.product\?\.id/,
    );


    // detail update

    assert.match(
      detail,
      /product-metadata-form/,
    );

    assert.match(
      detail,
      /method:\s*"PATCH"/,
    );

    assert.match(
      detail,
      /\/api\/admin\/products\/\$\{encodeURIComponent\(product\.id\)\}/,
    );


    // price

    assert.match(
      detail,
      /product-price-form/,
    );

    assert.match(
      detail,
      /amountRial/,
    );

    assert.match(
      detail,
      /product-price-form/,
    );


    // inventory

    assert.match(
      detail,
      /product-inventory-form/,
    );

    assert.match(
      detail,
      /quantityDelta/,
    );

    assert.match(
      detail,
      /inventory_conflict/,
    );


    // archive

    assert.match(
      detail,
      /product-archive-form/,
    );

    assert.match(
      detail,
      /status:\s*"archived"/,
    );

  },
);
