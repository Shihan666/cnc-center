import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin status action keeps invalid order transitions blocked",
  async () => {

    const route =
      await fs.readFile(
        "src/pages/api/admin/orders/[id]/status.ts",
        "utf8",
      );

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );


    assert.match(
      route,
      /transitionAdminOrderStatus/,
    );

    assert.match(
      route,
      /toStatus/,
    );

    assert.match(
      route,
      /invalid_transition/,
    );

    assert.match(
      route,
      /fromStatus/,
    );


    assert.match(
      policy,
      /paid/,
    );

    assert.match(
      policy,
      /processing/,
    );

    assert.match(
      policy,
      /completed/,
    );


    assert.doesNotMatch(
      policy,
      /completed[\s\S]*paid/,
    );

    assert.doesNotMatch(
      policy,
      /completed[\s\S]*processing/,
    );

  },
);
