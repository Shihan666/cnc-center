import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin order detail UX keeps locked contracts",
  async () => {

    const detail =
      await fs.readFile(
        "src/pages/admin/orders/[id].astro",
        "utf8",
      );

    assert.match(
      detail,
      /\/api\/admin\/orders\/\$\{encodeURIComponent\(orderId\)\}/,
    );

    assert.match(
      detail,
      /response\.ok/,
    );

    assert.match(
      detail,
      /response\.json/,
    );

    assert.match(
      detail,
      /role="alert"/,
    );

    assert.match(
      detail,
      /order\.items/,
    );

    assert.match(
      detail,
      /order\.payments/,
    );

    assert.match(
      detail,
      /order\.statusHistory/,
    );

    assert.match(
      detail,
      /nextAdminStatus/,
    );

    assert.match(
      detail,
      /data-order-status-root/,
    );

    assert.match(
      detail,
      /data-order-status-submit/,
    );

    assert.match(
      detail,
      /\/status/,
    );

    assert.match(
      detail,
      /method:\s*"POST"/,
    );

    assert.match(
      detail,
      /invalid_session/,
    );

    assert.match(
      detail,
      /invalid_transition/,
    );

    assert.match(
      detail,
      /window\.location\.reload/,
    );

  },
);
