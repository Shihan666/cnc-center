import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment start flow creates payment before redirect",
  async () => {

    const start =
      await fs.readFile(
        "src/pages/api/payments/zarinpal/start/index.ts",
        "utf8",
      );

    const service =
      await fs.readFile(
        "src/server/payments/service.ts",
        "utf8",
      );

    assert.match(
      start,
      /orderId/,
    );

    assert.match(
      start,
      /amountRial/,
    );

    assert.match(
      start,
      /startPayment/,
    );

    assert.match(
      service,
      /createPaymentRecord/,
    );

    assert.match(
      service,
      /createZarinPalRequest/,
    );

    assert.match(
      service,
      /authority/,
    );

  },
);
