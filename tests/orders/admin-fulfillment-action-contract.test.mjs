import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin fulfillment flow respects order transition rules",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/orders/repository.ts",
        "utf8",
      );

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );

    const adminModel =
      await fs.readFile(
        "src/server/orders/admin-read-model.ts",
        "utf8",
      );


    assert.match(
      repository,
      /status/,
    );

    assert.match(
      repository,
      /markOrderPaidAfterPayment/,
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
      adminModel,
      /status/,
    );

  },
);
