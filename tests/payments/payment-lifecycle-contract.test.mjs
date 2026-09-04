import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment lifecycle keeps order boundary contracts",
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
      /createPaymentRecord/,
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
      /status/,
    );

    assert.match(
      repository,
      /authority/,
    );

    assert.match(
      repository,
      /refId/,
    );

    assert.match(
      schema,
      /payments/,
    );

    assert.match(
      schema,
      /paymentStatusEnum/,
    );

    assert.match(
      schema,
      /paid/,
    );

    assert.match(
      schema,
      /failed/,
    );

  },
);
