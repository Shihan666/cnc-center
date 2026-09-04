import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "zarinpal verify route keeps payment completion boundary",
  async () => {

    const route =
      await fs.readFile(
        "src/pages/api/payments/zarinpal/verify/index.ts",
        "utf8",
      );

    assert.match(
      route,
      /Authority/,
    );

    assert.match(
      route,
      /Status/,
    );

    assert.match(
      route,
      /verifyPayment/,
    );

    assert.match(
      route,
      /payment_cancelled/,
    );

    assert.match(
      route,
      /verification_failed/,
    );

  },
);
