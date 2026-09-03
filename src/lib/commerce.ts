import type { ProductEntry } from "./products.ts";

import {
  commerceConfig,
  shippingMethods,
  type CommerceMoneyUnit,
  type CommerceShippingClass,
  type ShippingMethodDefinition,
  type ShippingMethodId,
} from "../config/commerce.ts";

export type ProductShippingClass =
  ProductEntry["data"]["shippingClass"];

type ProductShippingClassContract =
  [ProductShippingClass] extends
  [CommerceShippingClass]
    ? [CommerceShippingClass] extends
      [ProductShippingClass]
      ? true
      : never
    : never;

/*
 * Compile-time contract:
 * product shipping classes and commerce
 * shipping classes must remain identical.
 */
export const PRODUCT_SHIPPING_CLASS_CONTRACT:
  ProductShippingClassContract = true;

export interface CommerceLineAmountInput {
  unitPrice: number;
  priceUnit: CommerceMoneyUnit;
  quantity: number;
}

function assertSafeNonNegativeInteger(
  value: number,
  label: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new RangeError(
      `${label} must be a non-negative safe integer.`,
    );
  }
}

export function toRialAmount(
  amount: number,
  unit: CommerceMoneyUnit,
): number {
  if (
    !Number.isFinite(amount) ||
    amount < 0
  ) {
    throw new RangeError(
      "Money amount must be a finite non-negative number.",
    );
  }

  const rialAmount =
    unit === "toman"
      ? amount *
        commerceConfig.money
          .tomanToRialMultiplier
      : amount;

  if (!Number.isSafeInteger(rialAmount)) {
    throw new RangeError(
      "Canonical IRR amount must be a safe integer.",
    );
  }

  return rialAmount;
}

export function calculateLineTotalRial(
  input: CommerceLineAmountInput,
): number {
  assertSafeNonNegativeInteger(
    input.quantity,
    "Quantity",
  );

  if (input.quantity < 1) {
    throw new RangeError(
      "Quantity must be at least 1.",
    );
  }

  const unitPriceRial =
    toRialAmount(
      input.unitPrice,
      input.priceUnit,
    );

  const total =
    unitPriceRial * input.quantity;

  if (!Number.isSafeInteger(total)) {
    throw new RangeError(
      "Line total exceeds JavaScript safe integer range.",
    );
  }

  return total;
}

export function calculateCartSubtotalRial(
  lines: readonly CommerceLineAmountInput[],
): number {
  let subtotal = 0;

  for (const line of lines) {
    subtotal +=
      calculateLineTotalRial(line);

    if (!Number.isSafeInteger(subtotal)) {
      throw new RangeError(
        "Cart subtotal exceeds JavaScript safe integer range.",
      );
    }
  }

  return subtotal;
}

export function isValidCartQuantity(
  quantity: number,
  stockQuantity: number,
): boolean {
  return (
    Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    quantity <=
      commerceConfig.cart
        .maxQuantityPerLine &&
    Number.isSafeInteger(stockQuantity) &&
    stockQuantity >= 0 &&
    quantity <= stockQuantity
  );
}

export function getShippingMethod(
  methodId: ShippingMethodId,
): ShippingMethodDefinition | null {
  const methods:
    readonly ShippingMethodDefinition[] =
      shippingMethods;

  return (
    methods.find(
      (method) =>
        method.id === methodId,
    ) ?? null
  );
}

export function normalizeIranianCityName(
  city: string,
): string {
  return city
    .trim()
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replace(/\s+/g, " ");
}

export function isShippingMethodEligible(
  methodId: ShippingMethodId,
  shippingClass: ProductShippingClass,
  destinationCity?: string,
): boolean {
  const method =
    getShippingMethod(methodId);

  if (!method) {
    return false;
  }

  if (
    !method.allowedShippingClasses.includes(
      shippingClass,
    )
  ) {
    return false;
  }

  if (
    method.destinationScope ===
    "tehran-only"
  ) {
    if (!destinationCity) {
      return false;
    }

    return (
      normalizeIranianCityName(
        destinationCity,
      ) === "تهران"
    );
  }

  return true;
}

export function getEligibleShippingMethods(
  shippingClass: ProductShippingClass,
  destinationCity?: string,
): ShippingMethodDefinition[] {
  const methods:
    readonly ShippingMethodDefinition[] =
      shippingMethods;

  return methods.filter((method) =>
    isShippingMethodEligible(
      method.id,
      shippingClass,
      destinationCity,
    ),
  );
}

export function getEligibleShippingMethodsForCart(
  shippingClasses:
    readonly ProductShippingClass[],
  destinationCity?: string,
): ShippingMethodDefinition[] {
  if (shippingClasses.length === 0) {
    return [];
  }

  const methods:
    readonly ShippingMethodDefinition[] =
      shippingMethods;

  return methods.filter((method) =>
    shippingClasses.every(
      (shippingClass) =>
        isShippingMethodEligible(
          method.id,
          shippingClass,
          destinationCity,
        ),
    ),
  );
}

export function getShippingFeeRial(
  methodId: ShippingMethodId,
): number | null {
  const method =
    getShippingMethod(methodId);

  if (!method) {
    return null;
  }

  if (method.feeMode === "free") {
    return 0;
  }

  /*
   * Quote-based methods intentionally return
   * null until a real shipping rate has been
   * resolved by checkout/server logic.
   */
  return null;
}

export function requiresShippingQuote(
  methodId: ShippingMethodId,
): boolean {
  const method =
    getShippingMethod(methodId);

  return method?.feeMode === "quote";
}
