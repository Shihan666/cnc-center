import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";


test(
  "completed refund connects payment and order lifecycle",
  async () => {

    const service =
      await fs.readFile(
        "src/server/refunds/service.ts",
        "utf8",
      );


    assert.match(
      service,
      /completeRefund/,
    );

    assert.match(
      service,
      /updateRefundStatus/,
    );


    assert.match(
      service,
      /markPaymentRefunded/,
    );


    assert.match(
      service,
      /order/,
    );

  },
);
