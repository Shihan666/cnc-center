import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product detail edge workflows keep locked contracts",
  async () => {

    const detail =
      await fs.readFile(
        "src/pages/admin/products/[id].astro",
        "utf8",
      );

    assert.match(
      detail,
      /safeReadJson/,
    );

    assert.match(
      detail,
      /responseMessage/,
    );

    assert.match(
      detail,
      /invalid_session/,
    );

    assert.match(
      detail,
      /not_found/,
    );

    assert.match(
      detail,
      /product_conflict/,
    );

    assert.match(
      detail,
      /inventory_conflict/,
    );

    assert.match(
      detail,
      /invalid_price/,
    );

    assert.match(
      detail,
      /invalid_inventory_adjustment/,
    );

    assert.match(
      detail,
      /Number\.isSafeInteger/,
    );

    assert.match(
      detail,
      /amountRial/,
    );

    assert.match(
      detail,
      /quantityDelta/,
    );

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
