import {
  randomUUID,
} from 'node:crypto';

import {
  and,
  eq,
  isNull,
} from 'drizzle-orm';

import type {
  PreparedOrderDraft,
} from '../../lib/orders/types.ts';

import {
  getDatabase,
} from '../db/client.ts';

import {
  inventory,
  inventoryReservations,
  orderItems,
  orderStatusHistory,
  orders,
  productPrices,
  products,
} from '../db/schema.ts';

export interface CreatePublicPendingOrderInput {
  order:
    PreparedOrderDraft;

  createdAt:
    Date;

  reservationExpiresAt:
    Date;
}

export type CreatePublicPendingOrderResult =
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
        'stock_unavailable';

      productId:
        string;
    }
  | {
      status:
        'commerce_changed';

      productId:
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

function createPublicOrderNumber(
  orderId: string,
  createdAt: Date,
): string {
  const datePart =
    createdAt
      .toISOString()
      .slice(0, 10)
      .replaceAll('-', '');

  const idPart =
    orderId
      .replaceAll('-', '')
      .slice(0, 12)
      .toUpperCase();

  return (
    `CNC-${datePart}-${idPart}`
  );
}

function validatePreparedOrder(
  order: PreparedOrderDraft,
): void {
  if (
    !Array.isArray(order.lines) ||
    order.lines.length === 0
  ) {
    throw new Error(
      'Public order persistence requires at least one prepared order line.',
    );
  }

  const productIds =
    new Set<string>();

  for (const line of order.lines) {
    if (
      !line.productId ||
      productIds.has(
        line.productId,
      )
    ) {
      throw new Error(
        'Prepared public order lines must contain unique product IDs.',
      );
    }

    if (
      !Number.isSafeInteger(
        line.quantity,
      ) ||
      line.quantity < 1
    ) {
      throw new Error(
        'Prepared public order line quantity must be a positive safe integer.',
      );
    }

    productIds.add(
      line.productId,
    );
  }
}

export async function createPublicPendingOrder(
  input:
    CreatePublicPendingOrderInput,
): Promise<CreatePublicPendingOrderResult> {
  if (!isValidDate(input.createdAt)) {
    throw new Error(
      'Public order creation time must be a valid Date.',
    );
  }

  if (
    !isValidDate(
      input.reservationExpiresAt,
    ) ||
    input.reservationExpiresAt
      .getTime() <=
      input.createdAt.getTime()
  ) {
    throw new Error(
      'Public order reservation expiry must be after creation time.',
    );
  }

  validatePreparedOrder(
    input.order,
  );

  const database =
    getDatabase();

  const orderId =
    randomUUID();

  const orderNumber =
    createPublicOrderNumber(
      orderId,
      input.createdAt,
    );

  const sortedLines =
    [...input.order.lines]
      .sort(
        (left, right) =>
          left.productId.localeCompare(
            right.productId,
          ),
      );

  return database.transaction(
    async (
      tx,
    ): Promise<CreatePublicPendingOrderResult> => {
      const lockedInventory =
        new Map<
          string,
          {
            onHand: number;
            reserved: number;
          }
        >();

      /*
       * Inventory rows are always locked in
       * product-id order. This gives concurrent
       * multi-product checkouts a deterministic
       * lock order and avoids overselling.
       */
      for (const line of sortedLines) {
        /*
         * Product is locked before price so this
         * transaction follows the same lock order
         * as administrative price changes.
         *
         * This makes the order snapshot authoritative
         * at the transaction serialization point,
         * rather than trusting the earlier storefront
         * read performed by the checkout service.
         */
        const productRows =
          await tx
            .select({
              id:
                products.id,

              name:
                products.name,

              brand:
                products.brand,

              partNumber:
                products.partNumber,

              status:
                products.status,

              commerceMode:
                products.commerceMode,

              priceVisibility:
                products.priceVisibility,

              shippingClass:
                products.shippingClass,
            })
            .from(
              products,
            )
            .where(
              eq(
                products.id,
                line.productId,
              ),
            )
            .for('update')
            .limit(1);

        const currentProduct =
          productRows[0];

        if (!currentProduct) {
          return {
            status:
              'commerce_changed',

            productId:
              line.productId,
          };
        }

        const priceRows =
          await tx
            .select({
              amountRial:
                productPrices.amountRial,
            })
            .from(
              productPrices,
            )
            .where(
              and(
                eq(
                  productPrices.productId,
                  line.productId,
                ),
                isNull(
                  productPrices.validTo,
                ),
              ),
            )
            .for('update')
            .limit(1);

        const currentPrice =
          priceRows[0];

        if (
          currentProduct.status !==
            'active' ||
          currentProduct.commerceMode !==
            'direct-purchase' ||
          currentProduct.priceVisibility !==
            'visible' ||
          currentProduct.shippingClass !==
            line.shippingClass ||
          currentProduct.name !==
            line.name ||
          currentProduct.brand !==
            line.brand ||
          currentProduct.partNumber !==
            line.partNumber ||
          !currentPrice ||
          currentPrice.amountRial !==
            line.unitPriceRial
        ) {
          return {
            status:
              'commerce_changed',

            productId:
              line.productId,
          };
        }

        const rows =
          await tx
            .select({
              productId:
                inventory.productId,

              onHand:
                inventory.onHand,

              reserved:
                inventory.reserved,
            })
            .from(
              inventory,
            )
            .where(
              eq(
                inventory.productId,
                line.productId,
              ),
            )
            .for('update')
            .limit(1);

        const row =
          rows[0];

        if (!row) {
          return {
            status:
              'stock_unavailable',

            productId:
              line.productId,
          };
        }

        const available =
          row.onHand -
          row.reserved;

        if (
          available <
          line.quantity
        ) {
          return {
            status:
              'stock_unavailable',

            productId:
              line.productId,
          };
        }

        lockedInventory.set(
          line.productId,
          {
            onHand:
              row.onHand,

            reserved:
              row.reserved,
          },
        );
      }

      await tx
        .insert(
          orders,
        )
        .values({
          id:
            orderId,

          orderNumber,

          status:
            'pending',

          customerName:
            input.order.customer.name,

          customerPhone:
            input.order.customer.phone,

          customerCity:
            input.order.customer.city,

          customerAddress:
            input.order.customer.address,

          customerNotes:
            input.order.customer.notes,

          shippingMethodId:
            input.order.shippingMethodId,

          shippingMethodLabel:
            input.order.shippingMethodLabel,

          subtotalRial:
            input.order.subtotalRial,

          shippingFeeRial:
            input.order.shippingFeeRial,

          totalRial:
            input.order.totalRial,

          currency:
            input.order.currency,

          paymentReady:
            input.order.paymentReady,

          createdAt:
            input.createdAt,

          updatedAt:
            input.createdAt,

          paidAt:
            null,
        });

      await tx
        .insert(
          orderItems,
        )
        .values(
          input.order.lines.map(
            (line) => ({
              orderId,

              productId:
                line.productId,

              productName:
                line.name,

              brand:
                line.brand,

              partNumber:
                line.partNumber,

              quantity:
                line.quantity,

              unitPriceRial:
                line.unitPriceRial,

              lineTotalRial:
                line.lineTotalRial,

              shippingClass:
                line.shippingClass,

              createdAt:
                input.createdAt,
            }),
          ),
        );

      await tx
        .insert(
          orderStatusHistory,
        )
        .values({
          orderId,

          fromStatus:
            null,

          toStatus:
            'pending',

          reason:
            'public_checkout_created',

          createdAt:
            input.createdAt,
        });

      await tx
        .insert(
          inventoryReservations,
        )
        .values(
          input.order.lines.map(
            (line) => ({
              productId:
                line.productId,

              orderId,

              quantity:
                line.quantity,

              status:
                'active' as const,

              expiresAt:
                input
                  .reservationExpiresAt,

              createdAt:
                input.createdAt,

              releasedAt:
                null,
            }),
          ),
        );

      for (const line of sortedLines) {
        const current =
          lockedInventory.get(
            line.productId,
          );

        if (!current) {
          throw new Error(
            'Locked public checkout inventory state was lost.',
          );
        }

        const nextReserved =
          current.reserved +
          line.quantity;

        if (
          nextReserved >
          current.onHand
        ) {
          throw new Error(
            'Public checkout reservation exceeded locked on-hand inventory.',
          );
        }

        const updatedRows =
          await tx
            .update(
              inventory,
            )
            .set({
              reserved:
                nextReserved,

              updatedAt:
                input.createdAt,
            })
            .where(
              eq(
                inventory.productId,
                line.productId,
              ),
            )
            .returning({
              productId:
                inventory.productId,
            });

        if (!updatedRows[0]) {
          throw new Error(
            'Public checkout inventory reservation update lost its locked row.',
          );
        }
      }

      return {
        status:
          'created',

        orderId,

        orderNumber,

        orderStatus:
          'pending',

        createdAt:
          input.createdAt,

        reservationExpiresAt:
          input.reservationExpiresAt,
      };
    },
  );
}