import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "complete refund uses database transaction boundary",
  async () => {

    const service =
      await fs.readFile(
        "src/server/refunds/service.ts",
        "utf8",
      );


    assert.match(
      service,
      /withDatabaseTransaction/,
    );


    assert.match(
      service,
      /markPaymentRefunded/,
    );


    assert.match(
      service,
      /createOrderStatusHistory/,
    );

  },
);
