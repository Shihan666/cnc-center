import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

const apiPath =
  "src/pages/api/admin/orders/[id]/status.ts";

test(
  "admin order status route keeps the locked workflow boundary",
  async () => {
    const source =
      await fs.readFile(
        apiPath,
        "utf8",
      );

    assert.match(
      source,
      /export const POST/,
    );

    assert.match(
      source,
      /resolveAdminApiSession/,
    );

    assert.match(
      source,
      /transitionAdminOrderStatus/,
    );

    assert.match(
      source,
      /isAdminOrderStatus/,
    );

    assert.doesNotMatch(
      source,
      /update\(orders\)/,
    );

    assert.doesNotMatch(
      source,
      /insert\(orderStatusHistory\)/,
    );
  },
);
