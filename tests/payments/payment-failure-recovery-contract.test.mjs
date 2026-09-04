import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment failure and recovery flow keeps payment state safe",
  async () => {

    const verifyService =
      await fs.readFile(
        "src/server/payments/verification-service.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/payments/repository.ts",
        "utf8",
      );

    const verifyRoute =
      await fs.readFile(
        "src/pages/api/payments/zarinpal/verify/index.ts",
        "utf8",
      );


    assert.match(
      verifyService,
      /markPaymentFailed/,
    );

    assert.match(
      verifyService,
      /verifyZarinPalPayment/,
    );

    assert.match(
      repository,
      /status:\s*"failed"/,
    );

    assert.match(
      verifyRoute,
      /verified/,
    );

    assert.match(
      verifyRoute,
      /"false"/,
    );

    assert.match(
      verifyRoute,
      /Response\.redirect/,
    );

  },
);
