import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "checkout submit flow keeps locked contracts",
  async () => {

    const checkout =
      await fs.readFile(
        "src/components/checkout/CheckoutIsland.tsx",
        "utf8",
      );

    assert.match(
      checkout,
      /\/api\/orders/,
    );

    assert.match(
      checkout,
      /POST/,
    );

    assert.match(
      checkout,
      /fetch/,
    );

    assert.match(
      checkout,
      /response\.ok/,
    );

    assert.match(
      checkout,
      /response\.json/,
    );

    assert.match(
      checkout,
      /invalid_order/,
    );

  },
);
