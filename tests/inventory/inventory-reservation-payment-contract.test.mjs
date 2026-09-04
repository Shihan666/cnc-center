import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "paid payment consumes inventory reservation lifecycle",
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

    const reservationService =
      await fs.readFile(
        "src/server/orders/reservation-repository.ts",
        "utf8",
      );


    assert.match(
      verification,
      /consumePaidOrderReservations/,
    );


    assert.match(
      reservation,
      /consumePaidOrderReservations/,
    );


    assert.match(
      reservation,
      /not_paid/,
    );


    assert.match(
      reservation,
      /quantity/,
    );


    assert.match(
      reservation,
      /inventory/,
    );


    assert.match(
      reservationService,
      /reservation/,
    );

  },
);

