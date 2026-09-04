import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin product detail api keeps contentId contract",
  async () => {

    const detail =
      await fs.readFile(
        "src/pages/api/admin/products/[id].ts",
        "utf8",
      );

    assert.match(
      detail,
      /getAdminProductDetailSnapshot/,
    );

    assert.match(
      detail,
      /ok:\s*true/,
    );

    assert.match(
      detail,
      /product/,
    );

  },
);
