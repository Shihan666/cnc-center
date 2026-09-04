import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment audit trail keeps provider lifecycle data",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    const schema =
      await fs.readFile(
        "src/server/db/schema.ts",
        "utf8",
      );

    const verification =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );


    assert.match(
      repository,
      /authority/,
    );

    assert.match(
      repository,
      /refId/,
    );

    assert.match(
      repository,
      /providerMessage/,
    );

    assert.match(
      repository,
      /status/,
    );


    assert.match(
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /provider/,
    );

    assert.match(
      schema,
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
      verification,
      /markPaymentFailed/,
    );

  },
);
