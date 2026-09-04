import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin orders list UX keeps locked contracts",
  async () => {

    const orders =
      await fs.readFile(
        "src/pages/admin/orders/index.astro",
        "utf8",
      );

    assert.match(
      orders,
      /\/api\/admin\/orders/,
    );

    assert.match(
      orders,
      /response\.json/,
    );

    assert.match(
      orders,
      /response\.ok/,
    );

    assert.match(
      orders,
      /hasOrdersError/,
    );

    assert.match(
      orders,
      /orders\.length === 0/,
    );

    assert.match(
      orders,
      /EmptyState/,
    );

    assert.match(
      orders,
      /\/admin\/orders\/\$\{order\.id\}/,
    );

    assert.match(
      orders,
      /previousPageUrl/,
    );

    assert.match(
      orders,
      /nextPageUrl/,
    );

    assert.match(
      orders,
      /createPageUrl/,
    );

  },
);
