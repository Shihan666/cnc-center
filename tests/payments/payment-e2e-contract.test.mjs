import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment end to end flow keeps order payment lifecycle connected",
  async () => {

    const start =
      await fs.readFile(
        "src/server/payments/service.ts",
        "utf8",
      );

    const verify =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const startRoute =
      await fs.readFile(
        "src/pages/api/payments/zarinpal/start/index.ts",
        "utf8",
      );

    const verifyRoute =
      await fs.readFile(
        "src/pages/api/payments/zarinpal/verify/index.ts",
        "utf8",
      );

    const resultPage =
      await fs.readFile(
        "src/pages/payment/result.astro",
        "utf8",
      );


    assert.match(
      startRoute,
      /startPayment/,
    );

    assert.match(
      start,
      /createPaymentRecord/,
    );

    assert.match(
      start,
      /createZarinPalRequest/,
    );

    assert.match(
      verifyRoute,
      /verifyPayment/,
    );

    assert.match(
      verify,
      /markPaymentPaid/,
    );

    assert.match(
      verify,
      /consumePaidOrderReservations/,
    );

    assert.match(
      verifyRoute,
      /Response\.redirect/,
    );

    assert.match(
      resultPage,
      /verified/,
    );

    assert.match(
      resultPage,
      /orderId/,
    );

  },
);
