import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment admin monitoring keeps payment states observable",
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


    assert.match(
      repository,
      /getPaymentByOrderId/,
    );

    assert.match(
      repository,
      /markPaymentPaid/,
    );

    assert.match(
      repository,
      /markPaymentFailed/,
    );

    assert.match(
      repository,
      /providerMessage/,
    );

    assert.match(
      repository,
      /refId/,
    );


    assert.match(
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /status/,
    );

    assert.match(
      schema,
      /amountRial/,
    );

    assert.match(
      schema,
      /provider/,
    );

  },
);
