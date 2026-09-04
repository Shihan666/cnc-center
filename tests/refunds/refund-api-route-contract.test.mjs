import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";


test(
  "refund api route exposes order refund endpoint",
  async () => {

    const route =
      await fs.readFile(
        "src/pages/api/orders/[id]/refund.ts",
        "utf8",
      );


    assert.match(
      route,
      /createRefundRequest/,
    );


    assert.match(
      route,
      /refund_request_failed/,
    );


    assert.match(
      route,
      /export const POST/,
    );


    assert.match(
      route,
      /amountRial/,
    );

  },
);
