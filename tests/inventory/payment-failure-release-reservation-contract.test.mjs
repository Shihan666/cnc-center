import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "failed payment releases cancelled order reservations",
  async () => {

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const reservation =
      await fs.readFile(
        "src/server/orders/reservation-repository.ts",
        "utf8",
      );

    const payment =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );


    assert.match(
      verification,
      /markPaymentFailed/,
    );


    assert.match(
      payment,
      /status:\s*"failed"/,
    );


    assert.match(
      reservation,
      /releaseCancelledOrderReservations/,
    );


    assert.match(
      reservation,
      /released/,
    );


    assert.match(
      reservation,
      /reservation_release/,
    );


    assert.match(
      policy,
      /cancelled/,
    );

  },
);
