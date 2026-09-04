import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "full order payment inventory tracking lifecycle stays connected",
  async () => {

    const paymentService =
      await fs.readFile(
        "src/server/payments/service.ts",
        "utf8",
      );

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const orderRepository =
      await fs.readFile(
        "src/server/orders/repository.ts",
        "utf8",
      );

    const reservation =
      await fs.readFile(
        "src/server/orders/reservation-repository.ts",
        "utf8",
      );

    const tracking =
      await fs.readFile(
        "src/server/orders/public-tracking-service.ts",
        "utf8",
      );


    assert.match(
      paymentService,
      /createPaymentRecord/,
    );

    assert.match(
      paymentService,
      /createZarinPalRequest/,
    );


    assert.match(
      verification,
      /verifyZarinPalPayment/,
    );

    assert.match(
      verification,
      /markPaymentPaid/,
    );

    assert.match(
      verification,
      /consumePaidOrderReservations/,
    );


    assert.match(
      orderRepository,
      /markOrderPaidAfterPayment/,
    );


    assert.match(
      reservation,
      /consumePaidOrderReservations/,
    );


    assert.match(
      tracking,
      /findPublicOrderTracking/,
    );

    assert.match(
      tracking,
      /paidAt/,
    );

  },
);
