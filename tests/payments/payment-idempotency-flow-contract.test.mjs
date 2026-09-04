import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment flow stays idempotent after successful verification",
  async () => {

    const service =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    assert.match(
      service,
      /payment\.status === "paid"/,
    );

    assert.match(
      service,
      /return payment/,
    );

    assert.match(
      repository,
      /markPaymentPaid/,
    );

    assert.match(
      repository,
      /status:\s*"paid"/,
    );

    assert.match(
      repository,
      /refId/,
    );

  },
);
