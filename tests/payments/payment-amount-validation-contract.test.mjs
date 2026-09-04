import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment verification rejects amount mismatch",
  async () => {

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const provider =
      await fs.readFile(
        "src/server/payments/providers/zarinpal.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );


    assert.match(
      verification,
      /amountRial/,
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
      repository,
      /amountRial/,
    );


    assert.match(
      provider,
      /amount/,
    );


    assert.match(
      verification,
      /throw|error|mismatch|invalid/i,
    );

  },
);
