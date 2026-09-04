import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment verification service keeps payment lifecycle rules",
  async () => {

    const service =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    assert.match(
      service,
      /verifyZarinPalPayment/,
    );

    assert.match(
      service,
      /markPaymentPaid/,
    );

    assert.match(
      service,
      /markPaymentFailed/,
    );

    assert.match(
      service,
      /consumePaidOrderReservations/,
    );

    assert.match(
      service,
      /Payment record not found/,
    );

  },
);
