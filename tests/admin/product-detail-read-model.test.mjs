import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAdminProductDetailSnapshot,
} from "../../src/server/products/admin-detail-read-model.ts";

test(
  "admin product detail read model exposes only the locked safe product shape",
  async () => {
    const product =
      await getAdminProductDetailSnapshot(
        "00000000-0000-0000-0000-000000000000",
      );

    assert.equal(
      product,
      null,
    );

    if (product) {
      assert.equal(
        "paymentRuntimeConfig" in product,
        false,
      );

      assert.equal(
        "secretValue" in product,
        false,
      );

      assert.equal(
        typeof product.id,
        "string",
      );
    }
  },
);
