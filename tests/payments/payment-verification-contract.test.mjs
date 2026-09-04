import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment verification keeps lifecycle boundary",
  async () => {

    const service =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    assert.match(
      service,
      /verifyPayment/,
    );

    assert.match(
      service,
      /getPaymentByOrderId/,
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

  },
);
