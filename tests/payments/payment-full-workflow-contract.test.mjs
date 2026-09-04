import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment full workflow keeps locked contracts",
  async () => {

    const files = [
      "src/server/payments/service.ts",
      "src/server/payments/verification-service.ts",
      "src/server/orders/reservation-repository.ts",
    ];

    const startService =
      await fs.readFile(
        files[0],
        "utf8",
      );

    const verifyService =
      await fs.readFile(
        files[1],
        "utf8",
      );

    const reservation =
      await fs.readFile(
        files[2],
        "utf8",
      );

    assert.match(
      startService,
      /createPaymentRecord/,
    );

    assert.match(
      startService,
      /createZarinPalRequest/,
    );

    assert.match(
      startService,
      /updatePaymentAuthority/,
    );

    assert.match(
      verifyService,
      /verifyZarinPalPayment/,
    );

    assert.match(
      verifyService,
      /markPaymentPaid/,
    );

    assert.match(
      verifyService,
      /consumePaidOrderReservations/,
    );

    assert.match(
      reservation,
      /consumePaidOrderReservations/,
    );

    assert.match(
      reservation,
      /status:\s*'consumed'/,
    );

  },
);
