import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createAdminProductsSnapshot,
} from "../../src/server/products/read-model.ts";

test(
  "admin products read model exposes only the locked safe product shape",
  () => {
    const snapshot =
      createAdminProductsSnapshot([
        {
          id: "product-1",
          contentId: "content-1",
          sku: "SKU-1",
          partNumber: "PN-1",
          name: "Test Product",
          brand: "Test Brand",
          manufacturer: "Maker",
          condition: "new",
          commerceMode: "direct-purchase",
          priceVisibility: "visible",
          shippingClass: "standard",
          status: "active",
          currentPriceRial: 100000,
          onHand: 5,
          reserved: 1,
          available: 4,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          secretValue: "must-not-pass",
          paymentKey: "must-not-pass",
        },
      ]);

    assert.deepEqual(
      snapshot,
      [
        {
          id: "product-1",
          contentId: "content-1",
          sku: "SKU-1",
          partNumber: "PN-1",
          name: "Test Product",
          brand: "Test Brand",
          manufacturer: "Maker",
          condition: "new",
          commerceMode: "direct-purchase",
          priceVisibility: "visible",
          shippingClass: "standard",
          status: "active",
          currentPriceRial: 100000,
          onHand: 5,
          reserved: 1,
          available: 4,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    );
  },
);
