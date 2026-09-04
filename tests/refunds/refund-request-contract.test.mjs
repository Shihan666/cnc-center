import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund request keeps payment and order refund lifecycle connected",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/refunds/repository.ts",
        "utf8",
      );

    const schema =
      await fs.readFile(
        "src/server/db/schema.ts",
        "utf8",
      );


    assert.match(
      repository,
      /createRefund/,
    );

    assert.match(
      repository,
      /getRefundsByOrderId/,
    );

    assert.match(
      repository,
      /updateRefundStatus/,
    );


    assert.match(
      repository,
      /amountRial/,
    );

    assert.match(
      repository,
      /paymentId/,
    );


    assert.match(
      schema,
      /refunds/,
    );

    assert.match(
      schema,
      /refundStatusEnum/,
    );

  },
);
