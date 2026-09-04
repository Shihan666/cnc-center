import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin payment monitoring keeps payment lifecycle observable",
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

    const orderModel =
      await fs.readFile(
        "src/server/orders/admin-detail-read-model.ts",
        "utf8",
      );


    assert.match(
      repository,
      /getPaymentByOrderId/,
    );

    assert.match(
      repository,
      /status/,
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
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /amountRial/,
    );

    assert.match(
      schema,
      /provider/,
    );


    assert.match(
      orderModel,
      /payment/,
    );

  },
);
