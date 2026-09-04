import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product detail exposes contentId",
  async () => {

    const detail =
      await fs.readFile(
        "src/server/products/admin-detail-read-model.ts",
        "utf8",
      );

    assert.match(
      detail,
      /contentId:/,
    );

    assert.match(
      detail,
      /product\.contentId/,
    );

  },
);
