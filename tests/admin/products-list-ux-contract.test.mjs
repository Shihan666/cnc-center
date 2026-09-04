import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin products list UX keeps locked contracts",
  async () => {

    const list =
      await fs.readFile(
        "src/pages/admin/products/index.astro",
        "utf8",
      );

    assert.match(
      list,
      /\/api\/admin\/products/,
    );

    assert.match(
      list,
      /response\.ok/,
    );

    assert.match(
      list,
      /response\.json/,
    );

    assert.match(
      list,
      /hasProductsError/,
    );

    assert.match(
      list,
      /products\.length === 0/,
    );

    assert.match(
      list,
      /EmptyState/,
    );

    assert.match(
      list,
      /encodeURIComponent\(product\.id\)/,
    );

  },
);
