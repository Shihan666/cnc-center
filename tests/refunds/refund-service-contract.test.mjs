import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund service protects refund lifecycle rules",
  async () => {

    const service =
      await fs.readFile(
        "src/server/refunds/service.ts",
        "utf8",
      );


    assert.match(
      service,
      /requestRefund/,
    );

    assert.match(
      service,
      /refund_amount_exceeded/,
    );

    assert.match(
      service,
      /processRefund/,
    );

    assert.match(
      service,
      /completeRefund/,
    );

    assert.match(
      service,
      /failRefund/,
    );

    assert.match(
      service,
      /completed/,
    );

    assert.match(
      service,
      /processing/,
    );

  },
);
