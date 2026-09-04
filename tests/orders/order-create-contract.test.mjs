import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order creation api keeps locked contracts",
  async () => {

    const api =
      await fs.readFile(
        "src/pages/api/orders.ts",
        "utf8",
      );

    assert.match(
      api,
      /POST/,
    );

    assert.match(
      api,
      /readAdminAuthJsonObject/,
    );

    assert.match(
      api,
      /createPublicCheckoutOrder/,
    );

    assert.match(
      api,
      /invalid_order/,
    );

    assert.match(
      api,
      /order/,
    );

    assert.match(
      api,
      /reservationExpiresAt/,
    );

    assert.match(
      api,
      /201/,
    );

  },
);
