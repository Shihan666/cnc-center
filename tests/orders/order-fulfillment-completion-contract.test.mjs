import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order fulfillment completion follows valid status flow",
  async () => {

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/orders/repository.ts",
        "utf8",
      );

    const adminRoute =
      await fs.readFile(
        "src/pages/api/admin/orders/[id]/status.ts",
        "utf8",
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


    assert.match(
      repository,
      /status/,
    );


    assert.match(
      adminRoute,
      /transitionAdminOrderStatus/,
    );

    assert.match(
      adminRoute,
      /invalid_transition/,
    );


    assert.doesNotMatch(
      policy,
      /completed[\s\S]*processing/,
    );

    assert.doesNotMatch(
      policy,
      /completed[\s\S]*paid/,
    );

  },
);
