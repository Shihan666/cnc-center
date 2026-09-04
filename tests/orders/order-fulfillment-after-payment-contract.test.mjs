import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "paid payment completes order fulfillment transition",
  async () => {

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const order =
      await fs.readFile(
        "src/server/orders/repository.ts",
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
      verification,
      /markPaymentPaid/,
    );

    assert.match(
      order,
      /markOrderPaidAfterPayment/,
    );

    assert.match(
      order,
      /paid/,
    );

    assert.match(
      policy,
      /paid/,
    );

    assert.match(
      policy,
      /processing/,
    );

  },
);


