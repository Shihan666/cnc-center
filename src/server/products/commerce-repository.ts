import {
  and,
  eq,
  inArray,
  isNull,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  inventory,
  productPrices,
  products,
} from '../db/schema.ts';

import type {
  AdminProductCommerceMode,
  AdminProductCondition,
  AdminProductPriceVisibility,
  AdminProductShippingClass,
  AdminProductStatus,
} from './admin-model.ts';

export interface CommerceProductState {
  id: string;
  contentId: string;
  condition: AdminProductCondition;
  commerceMode: AdminProductCommerceMode;
  priceVisibility: AdminProductPriceVisibility;
  shippingClass: AdminProductShippingClass;
  status: AdminProductStatus;
  currentPriceRial: number | null;
  onHand: number;
  reserved: number;
  available: number;
}

export async function getCommerceProductsByContentIds(
  contentIds: readonly string[],
): Promise<CommerceProductState[]> {
  const normalizedContentIds =
    Array.from(
      new Set(
        contentIds
          .map(
            (contentId) =>
              contentId.trim(),
          )
          .filter(Boolean),
      ),
    );

  if (
    normalizedContentIds.length ===
    0
  ) {
    return [];
  }

  const database =
    getDatabase();

  const rows =
    await database
      .select({
        id:
          products.id,

        contentId:
          products.contentId,

        condition:
          products.condition,

        commerceMode:
          products.commerceMode,

        priceVisibility:
          products.priceVisibility,

        shippingClass:
          products.shippingClass,

        status:
          products.status,

        currentPriceRial:
          productPrices.amountRial,

        onHand:
          inventory.onHand,

        reserved:
          inventory.reserved,
      })
      .from(
        products,
      )
      .leftJoin(
        productPrices,
        and(
          eq(
            productPrices.productId,
            products.id,
          ),
          isNull(
            productPrices.validTo,
          ),
        ),
      )
      .leftJoin(
        inventory,
        eq(
          inventory.productId,
          products.id,
        ),
      )
      .where(
        inArray(
          products.contentId,
          normalizedContentIds,
        ),
      );

  return rows.map(
    (row) => {
      const onHand =
        row.onHand ?? 0;

      const reserved =
        row.reserved ?? 0;

      return {
        ...row,

        onHand,
        reserved,

        available:
          onHand - reserved,
      };
    },
  );
}
export async function getCommerceProductByContentId(
  contentId: string,
): Promise<CommerceProductState | null> {
  const normalizedContentId =
    contentId.trim();

  if (!normalizedContentId) {
    return null;
  }

  const products =
    await getCommerceProductsByContentIds([
      normalizedContentId,
    ]);

  return products[0] ?? null;
}
