import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "payment result page does not trust query success alone",
  async () => {

    const page =
      await fs.readFile(
        "src/pages/payment/result.astro",
        "utf8",
      );

    assert.match(
      page,
      /orderId/,
    );

    assert.match(
      page,
      /verified/,
    );

    assert.doesNotMatch(
      page,
      /status === "success"/,
    );

    assert.doesNotMatch(
      page,
      /params\.get\("status"\)/,
    );

  },
);
