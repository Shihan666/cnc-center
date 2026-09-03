import {
  inArray,
} from 'drizzle-orm';

import {
  formatRialAmount,
  type CartCatalogItem,
} from '../../lib/cart.ts';

import {
  prepareOrderDraft,
} from '../../lib/orders/prepare.ts';

import type {
  CheckoutSubmissionInput,
  OrderPreparationError,
  PreparedOrderDraft,
} from '../../lib/orders/types.ts';

import {
  getDatabase,
} from '../db/client.ts';

import {
  products,
} from '../db/schema.ts';

import {
  getCommerceProductsByContentIds,
} from '../products/commerce-repository.ts';

import {
  createPublicPendingOrder,
} from './public-repository.ts';

export const PUBLIC_ORDER_RESERVATION_TTL_MS =
  30 * 60 * 1000;

export interface CreatePublicCheckoutOrderInput {
  submission:
    CheckoutSubmissionInput;

  createdAt:
    Date;
}

export type CreatePublicCheckoutOrderResult =
  | {
      status:
        'created';

      orderId:
        string;

      orderNumber:
        string;

      orderStatus:
        'pending';

      createdAt:
        Date;

      reservationExpiresAt:
        Date;
    }
  | {
      status:
        'invalid_order';

      errors:
        OrderPreparationError[];
    }
  | {
      status:
        'stock_unavailable';

      contentId:
        string;
    }
  | {
      status:
        'commerce_changed';

      contentId:
        string;
    };

function isValidDate(
  value: Date,
): boolean {
  return (
    value instanceof Date &&
    Number.isFinite(
      value.getTime(),
    )
  );
}

function getRequestedContentIds(
  submission:
    CheckoutSubmissionInput,
): string[] {
  if (
    !Array.isArray(
      submission.items,
    )
  ) {
    return [];
  }

  const ids =
    new Set<string>();

  for (
    const item of
    submission.items
  ) {
    if (
      !item ||
      typeof item.productId !==
        'string'
    ) {
      continue;
    }

    const contentId =
      item.productId.trim();

    if (!contentId) {
      continue;
    }

    ids.add(
      contentId,
    );
  }

  return Array.from(ids);
}

export async function createPublicCheckoutOrder(
  input:
    CreatePublicCheckoutOrderInput,
): Promise<CreatePublicCheckoutOrderResult> {
  if (
    !isValidDate(
      input.createdAt,
    )
  ) {
    throw new Error(
      'Public checkout creation time must be a valid Date.',
    );
  }

  const requestedContentIds =
    getRequestedContentIds(
      input.submission,
    );

  const commerceStates =
    await getCommerceProductsByContentIds(
      requestedContentIds,
    );

  const database =
    getDatabase();

  const productRows =
    requestedContentIds.length === 0
      ? []
      : await database
          .select({
            id:
              products.id,

            contentId:
              products.contentId,

            name:
              products.name,

            brand:
              products.brand,

            partNumber:
              products.partNumber,
          })
          .from(
            products,
          )
          .where(
            inArray(
              products.contentId,
              requestedContentIds,
            ),
          );

  const productByContentId =
    new Map(
      productRows.map(
        (product) => [
          product.contentId,
          product,
        ],
      ),
    );

  const databaseIdByContentId =
    new Map<string, string>();

  const contentIdByDatabaseId =
    new Map<string, string>();

  const catalog:
    CartCatalogItem[] = [];

  for (
    const commerce of
    commerceStates
  ) {
    const product =
      productByContentId.get(
        commerce.contentId,
      );

    if (!product) {
      continue;
    }

    if (
      commerce.status !==
        'active' ||
      commerce.commerceMode !==
        'direct-purchase' ||
      commerce.priceVisibility !==
        'visible' ||
      commerce.currentPriceRial ===
        null ||
      commerce.available < 1
    ) {
      continue;
    }

    databaseIdByContentId.set(
      commerce.contentId,
      commerce.id,
    );

    contentIdByDatabaseId.set(
      commerce.id,
      commerce.contentId,
    );

    catalog.push({
      id:
        commerce.contentId,

      name:
        product.name,

      href:
        `/products/${encodeURIComponent(
          commerce.contentId,
        )}/`,

      brand:
        product.brand,

      partNumber:
        product.partNumber,

      image:
        null,

      stockQuantity:
        commerce.available,

      unitPriceRial:
        commerce.currentPriceRial,

      displayPrice:
        formatRialAmount(
          commerce.currentPriceRial,
        ),

      shippingClass:
        commerce.shippingClass,
    });
  }

  const prepared =
    prepareOrderDraft(
      input.submission,
      catalog,
    );

  if (!prepared.ok) {
    return {
      status:
        'invalid_order',

      errors:
        prepared.errors,
    };
  }

  const persistenceOrder:
    PreparedOrderDraft = {
      ...prepared.order,

      lines:
        prepared.order.lines.map(
          (line) => {
            const databaseProductId =
              databaseIdByContentId.get(
                line.productId,
              );

            if (
              !databaseProductId
            ) {
              throw new Error(
                'Prepared public checkout product lost its database identity.',
              );
            }

            return {
              ...line,

              productId:
                databaseProductId,
            };
          },
        ),
  };

  const reservationExpiresAt =
    new Date(
      input.createdAt.getTime() +
      PUBLIC_ORDER_RESERVATION_TTL_MS,
    );

  const persisted =
    await createPublicPendingOrder({
      order:
        persistenceOrder,

      createdAt:
        input.createdAt,

      reservationExpiresAt,
    });

  if (
    persisted.status ===
    'stock_unavailable'
  ) {
    return {
      status:
        'stock_unavailable',

      contentId:
        contentIdByDatabaseId.get(
          persisted.productId,
        ) ??
        persisted.productId,
    };
  }

  if (
    persisted.status ===
    'commerce_changed'
  ) {
    return {
      status:
        'commerce_changed',

      contentId:
        contentIdByDatabaseId.get(
          persisted.productId,
        ) ??
        persisted.productId,
    };
  }

  return persisted;
}