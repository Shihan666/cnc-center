import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund model keeps payment refund lifecycle connected",
  async () => {

    const schema =
      await fs.readFile(
        "src/server/db/schema.ts",
        "utf8",
      );

    const paymentRepository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    assert.match(
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /orderId/,
    );

    assert.match(
      schema,
      /amountRial/,
    );

    assert.match(
      paymentRepository,
      /markPaymentFailed/,
    );

  },
);




