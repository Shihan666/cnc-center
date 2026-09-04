import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund routes expose refund lifecycle actions",
  async () => {

    const routes =
      await fs.readFile(
        "src/server/refunds/routes.ts",
        "utf8",
      );


    assert.match(
      routes,
      /createRefundRequest/,
    );

    assert.match(
      routes,
      /startRefundProcess/,
    );

    assert.match(
      routes,
      /completeRefundProcess/,
    );

    assert.match(
      routes,
      /failRefundProcess/,
    );


    assert.match(
      routes,
      /requestRefund/,
    );

    assert.match(
      routes,
      /processRefund/,
    );

  },
);
