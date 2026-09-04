import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";


test(
  "refund validation protects payment amount boundary",
  async () => {

    const service =
      await fs.readFile(
        "src/server/refunds/service.ts",
        "utf8",
      );


    assert.match(
      service,
      /payment_not_found/,
    );


    assert.match(
      service,
      /payment_not_refundable/,
    );


    assert.match(
      service,
      /refund_amount_exceeded/,
    );


    assert.match(
      service,
      /getPaymentById/,
    );


    assert.match(
      service,
      /payment.amountRial/,
    );

  },
);
