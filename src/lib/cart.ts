import {
  calculateLineTotalRial,
  isValidCartQuantity,
} from "./commerce.ts";

import {
  commerceConfig,
  type CommerceShippingClass,
} from "../config/commerce.ts";

export interface CartStorageItem {
  productId: string;
  quantity: number;
}

export interface CartCatalogItem {
  id: string;

  name: string;

  href: string;

  brand: string;

  partNumber: string;

  image: string | null;

  stockQuantity: number;

  unitPriceRial: number;

  displayPrice: string;

  shippingClass:
    CommerceShippingClass;
}

export interface ResolvedCartLine
  extends CartCatalogItem {
  quantity: number;

  lineTotalRial: number;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function parseCartStorage(
  rawValue: string | null,
): CartStorageItem[] {
  if (!rawValue) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(rawValue);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const items:
    CartStorageItem[] = [];

  for (const candidate of parsed) {
    if (!isRecord(candidate)) {
      continue;
    }

    const productId =
      candidate.productId;

    const quantity =
      candidate.quantity;

    if (
      typeof productId !== "string" ||
      productId.trim().length === 0
    ) {
      continue;
    }

    if (
      !Number.isSafeInteger(quantity) ||
      (quantity as number) < 1
    ) {
      continue;
    }

    items.push({
      productId:
        productId.trim(),

      quantity:
        quantity as number,
    });

    if (
      items.length >=
      commerceConfig.cart
        .maxDistinctItems
    ) {
      break;
    }
  }

  return items;
}

export function serializeCartStorage(
  items: readonly CartStorageItem[],
): string {
  return JSON.stringify(
    items.map((item) => ({
      productId:
        item.productId,

      quantity:
        item.quantity,
    })),
  );
}

export function resolveCartLines(
  storedItems:
    readonly CartStorageItem[],

  catalog:
    readonly CartCatalogItem[],
): ResolvedCartLine[] {
  const catalogById =
    new Map(
      catalog.map((product) => [
        product.id,
        product,
      ]),
    );

  const quantities =
    new Map<string, number>();

  for (const stored of storedItems) {
    const product =
      catalogById.get(
        stored.productId,
      );

    if (!product) {
      continue;
    }

    const currentQuantity =
      quantities.get(product.id) ?? 0;

    const combinedQuantity =
      currentQuantity +
      stored.quantity;

    const quantity =
      Math.min(
        combinedQuantity,
        product.stockQuantity,
        commerceConfig.cart
          .maxQuantityPerLine,
      );

    if (
      !isValidCartQuantity(
        quantity,
        product.stockQuantity,
      )
    ) {
      continue;
    }

    quantities.set(
      product.id,
      quantity,
    );

    if (
      quantities.size >=
      commerceConfig.cart
        .maxDistinctItems
    ) {
      break;
    }
  }

  const lines:
    ResolvedCartLine[] = [];

  for (const product of catalog) {
    const quantity =
      quantities.get(product.id);

    if (quantity === undefined) {
      continue;
    }

    lines.push({
      ...product,

      quantity,

      lineTotalRial:
        calculateLineTotalRial({
          unitPrice:
            product.unitPriceRial,

          priceUnit:
            "rial",

          quantity,
        }),
    });
  }

  return lines;
}

export function cartLinesToStorageItems(
  lines:
    readonly ResolvedCartLine[],
): CartStorageItem[] {
  return lines.map((line) => ({
    productId:
      line.id,

    quantity:
      line.quantity,
  }));
}

export function calculateResolvedCartSubtotalRial(
  lines:
    readonly ResolvedCartLine[],
): number {
  let subtotal = 0;

  for (const line of lines) {
    subtotal +=
      line.lineTotalRial;

    if (!Number.isSafeInteger(subtotal)) {
      throw new RangeError(
        "Resolved cart subtotal exceeds JavaScript safe integer range.",
      );
    }
  }

  return subtotal;
}

export function formatRialAmount(
  amountRial: number,
): string {
  if (
    !Number.isSafeInteger(amountRial) ||
    amountRial < 0
  ) {
    throw new RangeError(
      "IRR amount must be a non-negative safe integer.",
    );
  }

  return `${new Intl.NumberFormat(
    "fa-IR",
    {
      maximumFractionDigits: 0,
    },
  ).format(amountRial)} ریال`;
}

export function formatTomanFromRial(
  amountRial: number,
): string {
  if (
    !Number.isSafeInteger(amountRial) ||
    amountRial < 0
  ) {
    throw new RangeError(
      "IRR amount must be a non-negative safe integer.",
    );
  }

  const tomanAmount =
    amountRial /
    commerceConfig.money
      .tomanToRialMultiplier;

  return `${new Intl.NumberFormat(
    "fa-IR",
    {
      maximumFractionDigits: 1,
    },
  ).format(tomanAmount)} تومان`;
}

export const CART_UPDATED_EVENT =
  "cnc-center-cart-updated";

export function getCartStoredQuantityTotal(
  rawValue: string | null,
): number {
  const items =
    parseCartStorage(rawValue);

  let total = 0;

  for (const item of items) {
    total += item.quantity;

    if (
      total >=
      commerceConfig.cart
        .maxDistinctItems *
        commerceConfig.cart
          .maxQuantityPerLine
    ) {
      return (
        commerceConfig.cart
          .maxDistinctItems *
        commerceConfig.cart
          .maxQuantityPerLine
      );
    }
  }

  return total;
}

export function dispatchCartUpdatedEvent(): void {
  if (
    typeof window ===
    "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new Event(
      CART_UPDATED_EVENT,
    ),
  );
}
