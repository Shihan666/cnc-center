import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

const pagePath =
  "src/pages/admin/orders/[id].astro";

test(
  "admin order detail page keeps the locked workflow contract",
  async () => {
    const source =
      await fs.readFile(
        pagePath,
        "utf8",
      );

    assert.match(
      source,
      /data-order-status-root/,
    );

    assert.match(
      source,
      /data-order-status-submit/,
    );

    assert.match(
      source,
      /data-order-status-message/,
    );

    assert.match(
      source,
      /data-next-status/,
    );

    assert.match(
      source,
      /statusHistory/,
    );

    assert.match(
      source,
      /invalid_transition/,
    );

    assert.match(
      source,
      /invalid_session/,
    );

    assert.match(
      source,
      /\/api\/admin\/orders\/\$\{encodeURIComponent\(orderId\)\}\/status/,
    );
  },
);
