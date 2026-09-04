import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

const pagePath =
  "src/pages/admin/products/[id].astro";

test(
  "admin product detail page keeps the locked product workflow contract",
  async () => {
    const source =
      await fs.readFile(
        pagePath,
        "utf8",
      );

    assert.match(
      source,
      /priceHistory/,
    );

    assert.match(
      source,
      /inventoryMovements/,
    );

    assert.match(
      source,
      /currentPriceRial/,
    );

    assert.match(
      source,
      /onHand/,
    );

    assert.match(
      source,
      /reserved/,
    );

    assert.match(
      source,
      /available/,
    );

    assert.match(
      source,
      /\/api\/admin\/products\/\$\{encodeURIComponent\(productId\)\}/,
    );
  },
);
