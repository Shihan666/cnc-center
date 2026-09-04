import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product detail UX states keep locked contracts",
  async () => {

    const detail =
      await fs.readFile(
        "src/pages/admin/products/[id].astro",
        "utf8",
      );

    assert.match(
      detail,
      /product-page-error/,
    );

    assert.match(
      detail,
      /role="alert"/,
    );

    assert.match(
      detail,
      /safeReadJson/,
    );

    assert.match(
      detail,
      /setButtonBusy/,
    );

    assert.match(
      detail,
      /aria-busy/,
    );

    assert.match(
      detail,
      /checkValidity/,
    );

    assert.match(
      detail,
      /Number\.isSafeInteger/,
    );

    assert.match(
      detail,
      /window\.confirm/,
    );

    assert.match(
      detail,
      /window\.location\.reload/,
    );

    assert.match(
      detail,
      /invalid_session/,
    );

    assert.match(
      detail,
      /invalid_price/,
    );

    assert.match(
      detail,
      /invalid_inventory_adjustment/,
    );

  },
);
