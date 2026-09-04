import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "refund service keeps lifecycle operations wired",
  async () => {

    const service =
      await fs.readFile(
        "src/server/refunds/service.ts",
        "utf8",
      );


    assert.match(
      service,
      /export async function processRefund/,
    );


    assert.match(
      service,
      /updateRefundStatus\([\s\S]*"processing"/,
    );


    assert.match(
      service,
      /export async function completeRefund/,
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


    assert.match(
      service,
      /export async function failRefund/,
    );


    assert.match(
      service,
      /updateRefundStatus\([\s\S]*"failed"/,
    );

  },
);
