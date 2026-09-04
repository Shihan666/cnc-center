import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment service keeps locked provider boundary contracts",
  async () => {

    const service =
      await fs.readFile(
        "src/server/payments/service.ts",
        "utf8",
      );

    const types =
      await fs.readFile(
        "src/server/payments/types.ts",
        "utf8",
      );

    assert.match(
      service,
      /createPaymentRequest/,
    );

    assert.match(
      service,
      /verifyPayment/,
    );

    assert.match(
      service,
      /Payment provider is not configured/,
    );

    assert.match(
      types,
      /CreatePaymentRequestInput/,
    );

    assert.match(
      types,
      /orderId/,
    );

    assert.match(
      types,
      /amountRial/,
    );

    assert.match(
      types,
      /PaymentRequestResult/,
    );

    assert.match(
      types,
      /authority/,
    );

    assert.match(
      types,
      /VerifyPaymentResult/,
    );

    assert.match(
      types,
      /paid/,
    );

    assert.match(
      types,
      /failed/,
    );

  },
);
