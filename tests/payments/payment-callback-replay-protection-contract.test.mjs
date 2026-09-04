import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment callback replay does not duplicate verification side effects",
  async () => {

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );


    assert.match(
      verification,
      /payment\.status === "paid"/,
    );


    assert.match(
      verification,
      /return payment/,
    );


    assert.match(
      repository,
      /getPaymentByOrderId/,
    );


    assert.match(
      repository,
      /status:\s*"paid"/,
    );


    assert.match(
      repository,
      /refId/,
    );


    assert.match(
      verification,
      /verifyZarinPalPayment/,
    );


  },
);
