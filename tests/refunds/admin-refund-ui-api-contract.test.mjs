import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin order refund ui connects to refund lifecycle api",
  async () => {

    const page =
      await fs.readFile(
        "src/pages/admin/orders/[id].astro",
        "utf8",
      );

    assert.match(
      page,
      /data-refund-process/,
    );

    assert.match(
      page,
      /data-refund-complete/,
    );

    assert.match(
      page,
      /data-refund-fail/,
    );

    assert.match(
      page,
      /\/api\/admin\/refunds\/\$\{encodeURIComponent\(refundId\)\}\/\$\{action\.endpoint\}/,
    );

  },
);
