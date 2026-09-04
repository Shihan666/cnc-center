import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "checkout rendering states keep locked contracts",
  async () => {

    const checkout =
      await fs.readFile(
        "src/components/checkout/CheckoutIsland.tsx",
        "utf8",
      );

    assert.match(
      checkout,
      /type="submit"/,
    );

    assert.match(
      checkout,
      /disabled/,
    );

    assert.match(
      checkout,
      /submitting/,
    );

    assert.match(
      checkout,
      /errors/,
    );

    assert.match(
      checkout,
      /createdOrder/,
    );

    assert.match(
      checkout,
      /orderNumber/,
    );

    assert.match(
      checkout,
      /reservationExpiresAt/,
    );

  },
);
