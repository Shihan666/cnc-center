import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "checkout UX states keep locked contracts",
  async () => {

    const checkout =
      await fs.readFile(
        "src/components/checkout/CheckoutIsland.tsx",
        "utf8",
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
      /setSubmitting/,
    );

    assert.match(
      checkout,
      /role="alert"/,
    );

    assert.match(
      checkout,
      /isValidIranPhone/,
    );

    assert.match(
      checkout,
      /handleSubmit/,
    );

    assert.match(
      checkout,
      /invalid_order/,
    );

  },
);
