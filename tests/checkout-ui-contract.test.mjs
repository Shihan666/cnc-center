import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "checkout UI keeps locked contracts",
  async () => {

    const checkout =
      await fs.readFile(
        "src/pages/checkout/index.astro",
        "utf8",
      );

    assert.match(
      checkout,
      /CheckoutIsland/,
    );

    assert.match(
      checkout,
      /\/cart\//,
    );

    assert.match(
      checkout,
      /CartCatalogItem/,
    );

    assert.match(
      checkout,
      /checkout/,
    );

    assert.match(
      checkout,
      /siteUrl/,
    );

  },
);
