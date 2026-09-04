import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product create workflow keeps locked contract",
  async () => {
    const page =
      await fs.readFile(
        "src/pages/admin/products/new.astro",
        "utf8",
      );

    const api =
      await fs.readFile(
        "src/pages/api/admin/products/index.ts",
        "utf8",
      );

    assert.match(
      page,
      /id="create-product-form"/,
    );

    assert.match(
      page,
      /\/api\/admin\/products/,
    );

    assert.match(
      page,
      /method:\s*"POST"/,
    );

    assert.match(
      page,
      /credentials:\s*"same-origin"/,
    );

    assert.match(
      page,
      /"Content-Type":\s*"application\/json"/,
    );

    assert.match(
      page,
      /contentId/,
    );

    assert.match(
      page,
      /partNumber/,
    );

    assert.match(
      page,
      /commerceMode/,
    );

    assert.match(
      page,
      /priceVisibility/,
    );

    assert.match(
      page,
      /shippingClass/,
    );

    assert.match(
      page,
      /window\.location\.replace/,
    );

    assert.match(
      api,
      /export const POST/,
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
      /201/,
    );

    assert.match(
      api,
      /invalid_product/,
    );

    assert.match(
      api,
      /product_conflict/,
    );
  },
);
