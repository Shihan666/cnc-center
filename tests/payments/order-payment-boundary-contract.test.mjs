import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order payment boundary keeps locked contracts",
  async () => {

    const files = [
      "src/server/orders/public-service.ts",
      "src/server/payments/repository.ts",
    ];

    const orderService =
      await fs.readFile(
        files[0],
        "utf8",
      );

    const paymentRepository =
      await fs.readFile(
        files[1],
        "utf8",
      );

    assert.match(
      orderService,
      /createPublicCheckoutOrder/,
    );

    assert.match(
      paymentRepository,
      /createPaymentRecord/,
    );

    assert.match(
      paymentRepository,
      /orderId/,
    );

    assert.match(
      paymentRepository,
      /amountRial/,
    );

    assert.match(
      paymentRepository,
      /status/,
    );

  },
);
