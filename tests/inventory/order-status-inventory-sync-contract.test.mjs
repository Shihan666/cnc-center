import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order status and inventory consumption stay synchronized",
  async () => {

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const reservation =
      await fs.readFile(
        "src/server/orders/reservation-repository.ts",
        "utf8",
      );

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );


    assert.match(
      verification,
      /consumePaidOrderReservations/,
    );


    assert.match(
      reservation,
      /consumePaidOrderReservations/,
    );

    assert.match(
      reservation,
      /quantity/,
    );

    assert.match(
      reservation,
      /inventory/,
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
      verification,
      /consumeFailed/,
    );

  },
);
