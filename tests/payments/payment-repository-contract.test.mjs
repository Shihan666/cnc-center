import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment repository keeps lifecycle contracts",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    assert.match(
      repository,
      /createPaymentRecord/,
    );

    assert.match(
      repository,
      /getPaymentByOrderId/,
    );

    assert.match(
      repository,
      /updatePaymentAuthority/,
    );

    assert.match(
      repository,
      /markPaymentPaid/,
    );

    assert.match(
      repository,
      /markPaymentFailed/,
    );

    assert.match(
      repository,
      /payments/,
    );

  },
);
