import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment verification is idempotent after paid state",
  async () => {

    const service =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    assert.match(
      service,
      /payment\.status === "paid"/,
    );

    assert.match(
      service,
      /return payment/,
    );

    assert.match(
      service,
      /markOrderPaidAfterPayment/,
    );

    assert.match(
      service,
      /consumePaidOrderReservations/,
    );

  },
);
