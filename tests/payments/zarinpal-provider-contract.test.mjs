import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "zarinpal provider keeps server boundary contracts",
  async () => {

    const provider =
      await fs.readFile(
        "src/server/payments/providers/zarinpal.ts",
        "utf8",
      );

    assert.match(
      provider,
      /createZarinPalRequest/,
    );

    assert.match(
      provider,
      /verifyZarinPalPayment/,
    );

    assert.match(
      provider,
      /authority/,
    );

    assert.match(
      provider,
      /refId/,
    );

    assert.match(
      provider,
      /callbackUrl/,
    );

    assert.match(
      provider,
      /ZarinPal request provider is not connected/,
    );

  },
);
