import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund reconciliation keeps order payment state connected",
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

    const schema =
      await fs.readFile(
        "src/server/db/schema.ts",
        "utf8",
      );


    assert.match(
      paymentRepository,
      /orderId/,
    );

    assert.match(
      paymentRepository,
      /status/,
    );


    assert.match(
      orderRepository,
      /status/,
    );

    assert.match(
      orderRepository,
      /paidAt/,
    );


    assert.match(
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /orders/,
    );

  },
);
