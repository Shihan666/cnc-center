import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment workflow keeps locked lifecycle contracts",
  async () => {

    const files = [
      "src/server/payments/service.ts",
      "src/server/payments/types.ts",
    ];

    const service =
      await fs.readFile(
        files[0],
        "utf8",
      );

    const types =
      await fs.readFile(
        files[1],
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
      /paymentId/,
    );

    assert.match(
      types,
      /authority/,
    );

    assert.match(
      types,
      /pending/,
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
