import assert from "node:assert/strict";
import test from "node:test";

import {
  createCommercePresentation,
} from "../../src/server/products/commerce-presentation.ts";

function createState(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    contentId: "test-product",
    sku: "TEST-001",
    partNumber: "TEST-PART",
    name: "Test Product",
    brand: "Test Brand",
    manufacturer: null,
    condition: "new",
    commerceMode: "direct-purchase",
    priceVisibility: "visible",
    shippingClass: "standard",
    status: "active",
    currentPriceRial: 12_500_000,
    onHand: 8,
    reserved: 3,
    available: 5,
    ...overrides,
  };
}

test(
  "commerce presentation formats authoritative visible Rial price",
  () => {
    const presentation =
      createCommercePresentation(
        createState(),
      );

    assert.equal(
      presentation.formattedPrice,
      "۱۲٬۵۰۰٬۰۰۰ ریال",
    );

    assert.equal(
      presentation.inventoryLabel,
      "موجودی: ۵ عدد",
    );

    assert.equal(
      presentation.directPurchaseEligible,
      true,
    );
  },
);

test(
  "commerce presentation hides a database-hidden price",
  () => {
    const presentation =
      createCommercePresentation(
        createState({
          priceVisibility: "hidden",
        }),
      );

    assert.equal(
      presentation.formattedPrice,
      null,
    );

    assert.equal(
      presentation.directPurchaseEligible,
      false,
    );
  },
);

test(
  "commerce presentation requires current price and available stock for direct purchase",
  () => {
    const withoutPrice =
      createCommercePresentation(
        createState({
          currentPriceRial: null,
        }),
      );

    const withoutStock =
      createCommercePresentation(
        createState({
          available: 0,
        }),
      );

    assert.equal(
      withoutPrice.directPurchaseEligible,
      false,
    );

    assert.equal(
      withoutStock.directPurchaseEligible,
      false,
    );

    assert.equal(
      withoutStock.inventoryLabel,
      "ناموجود",
    );
  },
);

test(
  "commerce presentation preserves sourcing semantics when inventory is unavailable",
  () => {
    const presentation =
      createCommercePresentation(
        createState({
          commerceMode: "sourcing-request",
          currentPriceRial: null,
          available: 0,
        }),
      );

    assert.equal(
      presentation.commerceModeLabel,
      "درخواست تأمین",
    );

    assert.equal(
      presentation.inventoryLabel,
      "تأمین سفارشی",
    );

    assert.equal(
      presentation.directPurchaseEligible,
      false,
    );
  },
);

test(
  "commerce presentation does not allow inactive database products to be purchased",
  () => {
    const presentation =
      createCommercePresentation(
        createState({
          status: "draft",
        }),
      );

    assert.equal(
      presentation.directPurchaseEligible,
      false,
    );
  },
);

test(
  "commerce presentation uses authoritative database condition",
  () => {
    const cases = [
      ["new", "نو"],
      ["used", "کارکرده"],
      ["refurbished", "بازسازی‌شده"],
      ["tested", "تست‌شده"],
    ];

    for (const [
      condition,
      expectedLabel,
    ] of cases) {
      const presentation =
        createCommercePresentation(
          createState({
            condition,
          }),
        );

      assert.equal(
        presentation.conditionLabel,
        expectedLabel,
      );
    }
  },
);