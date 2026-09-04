import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment service keeps provider boundary contracts",
  async () => {

    const service =
      await fs.readFile(
        "src/server/payments/service.ts",
        "utf8",
      );

    assert.match(
      service,
      /createPaymentRecord/,
    );

    assert.match(
      service,
      /createZarinPalRequest/,
    );

    assert.match(
      service,
      /updatePaymentAuthority/,
    );

    assert.match(
      service,
      /startPayment/,
    );

    assert.match(
      service,
      /callbackUrl/,
    );

  },
);
