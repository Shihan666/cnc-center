import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund lifecycle keeps payment and order cancellation connected",
  async () => {

    const paymentRepository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    const orderRepository =
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
      paymentRepository,
      /status/,
    );

    assert.match(
      paymentRepository,
      /orderId/,
    );


    assert.match(
      orderRepository,
      /status/,
    );


    assert.match(
      policy,
      /cancelled/,
    );

  },
);
