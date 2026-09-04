import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "checkout starts payment after order creation",
  async () => {
    const checkout =
      await fs.readFile(
        "src/components/checkout/CheckoutIsland.tsx",
        "utf8",
      );

    assert.match(
      checkout,
      /\/api\/orders\/payment-start/,
    );

    assert.match(
      checkout,
      /paymentResponse/,
    );

    assert.match(
      checkout,
      /amountRial/,
    );

    assert.match(
      checkout,
      /callbackUrl/,
    );

    assert.match(
      checkout,
      /paymentUrl/,
    );
  },
);
