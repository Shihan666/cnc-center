import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment refund state keeps refunded lifecycle connected",
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
      /markPaymentRefunded/,
    );

    assert.match(
      repository,
      /refunded/,
    );


    assert.match(
      schema,
      /payment_status/,
    );

    assert.match(
      schema,
      /'refunded'/,
    );

  },
);
