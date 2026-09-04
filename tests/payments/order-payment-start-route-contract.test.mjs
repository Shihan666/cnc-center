import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order payment start route keeps checkout boundary",
  async () => {

    const route =
      await fs.readFile(
        "src/pages/api/orders/payment-start/index.ts",
        "utf8",
      );

    assert.match(
      route,
      /startPayment/,
    );

    assert.match(
      route,
      /orderId/,
    );

    assert.match(
      route,
      /amountRial/,
    );

    assert.match(
      route,
      /callbackUrl/,
    );

    assert.match(
      route,
      /payment_start_failed/,
    );

  },
);
