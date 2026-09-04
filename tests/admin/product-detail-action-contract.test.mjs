import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

const pagePath =
  "src/pages/admin/products/[id].astro";

test(
  "admin product detail page locks product action endpoints",
  async () => {
    const source =
      await fs.readFile(
        pagePath,
        "utf8",
      );

    assert.match(
      source,
      /id="product-metadata-form"/,
    );

    assert.match(
      source,
      /data-endpoint=\{`\/api\/admin\/products\/\$\{encodeURIComponent\(product\.id\)\}`\}/,
    );

    assert.match(
      source,
      /method:\s*"PATCH"/,
    );

    assert.match(
      source,
      /id="product-price-form"/,
    );

    assert.match(
      source,
      /\/price`/,
    );

    assert.match(
      source,
      /method:\s*"POST"/,
    );

    assert.match(
      source,
      /id="product-inventory-form"/,
    );

    assert.match(
      source,
      /\/inventory`/,
    );

    assert.match(
      source,
      /quantityDelta/,
    );

    assert.match(
      source,
      /id="product-archive-form"/,
    );

    assert.match(
      source,
      /status:\s*"archived"/,
    );

    assert.match(
      source,
      /credentials:\s*"same-origin"/,
    );

    assert.match(
      source,
      /"Content-Type":\s*"application\/json"/,
    );
  },
);
