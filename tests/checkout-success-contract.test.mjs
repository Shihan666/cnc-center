import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "checkout success state keeps locked contracts",
  async () => {

    const checkout =
      await fs.readFile(
        "src/components/checkout/CheckoutIsland.tsx",
        "utf8",
      );

    assert.match(
      checkout,
      /createdOrder/,
    );

    assert.match(
      checkout,
      /setCreatedOrder/,
    );

    assert.match(
      checkout,
      /orderNumber/,
    );

    assert.match(
      checkout,
      /reservationExpiresAt/,
    );

    assert.match(
      checkout,
      /localStorage\.removeItem/,
    );

    assert.match(
      checkout,
      /dispatchCartUpdatedEvent/,
    );

  },
);
