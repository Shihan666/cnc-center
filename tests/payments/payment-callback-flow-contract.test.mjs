import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment callback keeps verification completion flow",
  async () => {

    const verify =
      await fs.readFile(
        "src/pages/api/payments/zarinpal/verify/index.ts",
        "utf8",
      );

    const service =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    assert.match(
      verify,
      /Authority/,
    );

    assert.match(
      verify,
      /Status/,
    );

    assert.match(
      verify,
      /verifyPayment/,
    );

    assert.match(
      verify,
      /Response\.redirect/,
    );

    assert.match(
      service,
      /markPaymentPaid/,
    );

    assert.match(
      service,
      /consumePaidOrderReservations/,
    );

  },
);
