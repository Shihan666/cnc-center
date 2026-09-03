import {
  and,
  asc,
  eq,
  inArray,
  lte,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  inventory,
  inventoryMovements,
  inventoryReservations,
  orderStatusHistory,
  orders,
} from '../db/schema.ts';

const EXPIRABLE_ORDER_STATUSES =
  [
    'pending',
    'awaiting_payment',
  ] as const;

const DEFAULT_EXPIRY_BATCH_LIMIT =
  100;

const MAX_EXPIRY_BATCH_LIMIT =
  500;

export interface ExpireDueOrderReservationsInput {
  expiredAt:
    Date;

  limit?:
    number;
}

export interface ExpireDueOrderReservationsResult {
  ordersExpired:
    number;

  reservationsExpired:
    number;

  unitsReleased:
    number;
}

interface ExpireOneOrderResult {
  reservationsExpired:
    number;

  unitsReleased:
    number;
}

function isValidDate(
  value:
    Date,
): boolean {
  return (
    value instanceof Date &&
    Number.isFinite(
      value.getTime(),
    )
  );
}

function normalizeLimit(
  value:
    number | undefined,
): number {
  const limit =
    value ??
    DEFAULT_EXPIRY_BATCH_LIMIT;

  if (
    !Number.isSafeInteger(
      limit,
    ) ||
    limit < 1 ||
    limit >
      MAX_EXPIRY_BATCH_LIMIT
  ) {
    throw new Error(
      'Reservation expiry batch limit must be a safe integer between 1 and 500.',
    );
  }

  return limit;
}

function isExpirableOrderStatus(
  value:
    string,
): boolean {
  return (
    value ===
      'pending' ||
    value ===
      'awaiting_payment'
  );
}

export async function expireDueOrderReservations(
  input:
    ExpireDueOrderReservationsInput,
): Promise<ExpireDueOrderReservationsResult> {
  if (
    !isValidDate(
      input.expiredAt,
    )
  ) {
    throw new Error(
      'Reservation expiry time must be a valid Date.',
    );
  }

  const limit =
    normalizeLimit(
      input.limit,
    );

  const expiredAt =
    new Date(
      input.expiredAt.getTime(),
    );

  const database =
    getDatabase();

  const candidateRows =
    await database
      .select({
        orderId:
          inventoryReservations.orderId,
      })
      .from(
        inventoryReservations,
      )
      .innerJoin(
        orders,
        eq(
          orders.id,
          inventoryReservations.orderId,
        ),
      )
      .where(
        and(
          eq(
            inventoryReservations.status,
            'active',
          ),
          lte(
            inventoryReservations.expiresAt,
            expiredAt,
          ),
          inArray(
            orders.status,
            [
              ...EXPIRABLE_ORDER_STATUSES,
            ],
          ),
        ),
      )
      .groupBy(
        inventoryReservations.orderId,
      )
      .orderBy(
        asc(
          inventoryReservations.orderId,
        ),
      )
      .limit(
        limit,
      );

  let ordersExpired =
    0;

  let reservationsExpired =
    0;

  let unitsReleased =
    0;

  for (
    const candidate of
    candidateRows
  ) {
    const result =
      await database.transaction(
        async (
          tx,
        ): Promise<ExpireOneOrderResult | null> => {
          const lockedOrderRows =
            await tx
              .select({
                id:
                  orders.id,

                status:
                  orders.status,
              })
              .from(
                orders,
              )
              .where(
                eq(
                  orders.id,
                  candidate.orderId,
                ),
              )
              .for('update')
              .limit(1);

          const lockedOrder =
            lockedOrderRows[0];

          if (
            !lockedOrder ||
            !isExpirableOrderStatus(
              lockedOrder.status,
            )
          ) {
            return null;
          }

          const reservationRows =
            await tx
              .select({
                id:
                  inventoryReservations.id,

                productId:
                  inventoryReservations.productId,

                quantity:
                  inventoryReservations.quantity,

                expiresAt:
                  inventoryReservations.expiresAt,
              })
              .from(
                inventoryReservations,
              )
              .where(
                and(
                  eq(
                    inventoryReservations.orderId,
                    candidate.orderId,
                  ),
                  eq(
                    inventoryReservations.status,
                    'active',
                  ),
                ),
              )
              .orderBy(
                asc(
                  inventoryReservations.productId,
                ),
                asc(
                  inventoryReservations.id,
                ),
              )
              .for('update');

          if (
            reservationRows.length ===
            0
          ) {
            return null;
          }

          if (
            reservationRows.some(
              (
                reservation,
              ) =>
                reservation.expiresAt
                  .getTime() >
                expiredAt.getTime(),
            )
          ) {
            return null;
          }

          const releaseByProduct =
            new Map<
              string,
              number
            >();

          for (
            const reservation of
            reservationRows
          ) {
            releaseByProduct.set(
              reservation.productId,
              (
                releaseByProduct.get(
                  reservation.productId,
                ) ??
                0
              ) +
                reservation.quantity,
            );
          }

          const lockedReserved =
            new Map<
              string,
              number
            >();

          const productIds =
            Array.from(
              releaseByProduct.keys(),
            ).sort();

          for (
            const productId of
            productIds
          ) {
            const inventoryRows =
              await tx
                .select({
                  productId:
                    inventory.productId,

                  reserved:
                    inventory.reserved,
                })
                .from(
                  inventory,
                )
                .where(
                  eq(
                    inventory.productId,
                    productId,
                  ),
                )
                .for('update')
                .limit(1);

            const currentInventory =
              inventoryRows[0];

            if (
              !currentInventory
            ) {
              throw new Error(
                'Expired reservation lost its inventory row.',
              );
            }

            const releaseQuantity =
              releaseByProduct.get(
                productId,
              );

            if (
              releaseQuantity ===
              undefined
            ) {
              throw new Error(
                'Expired reservation release quantity was lost.',
              );
            }

            if (
              currentInventory.reserved <
              releaseQuantity
            ) {
              throw new Error(
                'Expired reservation release exceeds reserved inventory.',
              );
            }

            lockedReserved.set(
              productId,
              currentInventory.reserved,
            );
          }

          for (
            const productId of
            productIds
          ) {
            const currentReserved =
              lockedReserved.get(
                productId,
              );

            const releaseQuantity =
              releaseByProduct.get(
                productId,
              );

            if (
              currentReserved ===
                undefined ||
              releaseQuantity ===
                undefined
            ) {
              throw new Error(
                'Locked reservation release state was lost.',
              );
            }

            const updatedInventoryRows =
              await tx
                .update(
                  inventory,
                )
                .set({
                  reserved:
                    currentReserved -
                    releaseQuantity,

                  updatedAt:
                    expiredAt,
                })
                .where(
                  eq(
                    inventory.productId,
                    productId,
                  ),
                )
                .returning({
                  productId:
                    inventory.productId,
                });

            if (
              !updatedInventoryRows[0]
            ) {
              throw new Error(
                'Expired reservation inventory update lost its locked row.',
              );
            }
          }

          for (
            const reservation of
            reservationRows
          ) {
            const updatedReservationRows =
              await tx
                .update(
                  inventoryReservations,
                )
                .set({
                  status:
                    'expired',

                  releasedAt:
                    expiredAt,
                })
                .where(
                  and(
                    eq(
                      inventoryReservations.id,
                      reservation.id,
                    ),
                    eq(
                      inventoryReservations.status,
                      'active',
                    ),
                  ),
                )
                .returning({
                  id:
                    inventoryReservations.id,
                });

            if (
              !updatedReservationRows[0]
            ) {
              throw new Error(
                'Expired reservation update lost its locked state.',
              );
            }
          }

          const fromStatus =
            lockedOrder.status;

          const updatedOrderRows =
            await tx
              .update(
                orders,
              )
              .set({
                status:
                  'expired',

                updatedAt:
                  expiredAt,
              })
              .where(
                and(
                  eq(
                    orders.id,
                    candidate.orderId,
                  ),
                  eq(
                    orders.status,
                    fromStatus,
                  ),
                ),
              )
              .returning({
                id:
                  orders.id,
              });

          if (
            !updatedOrderRows[0]
          ) {
            throw new Error(
              'Expired order update lost its locked state.',
            );
          }

          await tx
            .insert(
              orderStatusHistory,
            )
            .values({
              orderId:
                candidate.orderId,

              fromStatus,

              toStatus:
                'expired',

              reason:
                'inventory_reservation_expired',

              createdAt:
                expiredAt,
            });

          await tx
            .insert(
              inventoryMovements,
            )
            .values(
              reservationRows.map(
                (
                  reservation,
                ) => ({
                  productId:
                    reservation.productId,

                  type:
                    'reservation_release' as const,

                  quantityDelta:
                    0,

                  referenceType:
                    'inventory_reservation',

                  referenceId:
                    reservation.id,

                  note:
                    `Expired reservation released ${reservation.quantity} reserved unit(s); on-hand inventory unchanged.`,

                  createdAt:
                    expiredAt,
                }),
              ),
            );

          return {
            reservationsExpired:
              reservationRows.length,

            unitsReleased:
              reservationRows.reduce(
                (
                  total,
                  reservation,
                ) =>
                  total +
                  reservation.quantity,
                0,
              ),
          };
        },
      );

    if (!result) {
      continue;
    }

    ordersExpired +=
      1;

    reservationsExpired +=
      result.reservationsExpired;

    unitsReleased +=
      result.unitsReleased;
  }

  return {
    ordersExpired,
    reservationsExpired,
    unitsReleased,
  };
}
export interface ConsumePaidOrderReservationsInput {
  orderId:
    string;

  consumedAt:
    Date;
}

export type ConsumePaidOrderReservationsResult =
  | {
      status:
        'consumed';

      reservationsConsumed:
        number;

      unitsConsumed:
        number;
    }
  | {
      status:
        'already_settled';
    }
  | {
      status:
        'not_paid';
    }
  | {
      status:
        'not_found';
    };

const ORDER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function consumePaidOrderReservations(
  input:
    ConsumePaidOrderReservationsInput,
): Promise<ConsumePaidOrderReservationsResult> {
  const orderId =
    input.orderId.trim();

  if (
    !ORDER_ID_PATTERN.test(
      orderId,
    )
  ) {
    throw new Error(
      'Paid reservation consumption requires a valid order UUID.',
    );
  }

  if (
    !isValidDate(
      input.consumedAt,
    )
  ) {
    throw new Error(
      'Paid reservation consumption time must be a valid Date.',
    );
  }

  const consumedAt =
    new Date(
      input.consumedAt.getTime(),
    );

  const database =
    getDatabase();

  return database.transaction(
    async (
      tx,
    ): Promise<ConsumePaidOrderReservationsResult> => {
      const lockedOrderRows =
        await tx
          .select({
            id:
              orders.id,

            status:
              orders.status,
          })
          .from(
            orders,
          )
          .where(
            eq(
              orders.id,
              orderId,
            ),
          )
          .for('update')
          .limit(1);

      const lockedOrder =
        lockedOrderRows[0];

      if (!lockedOrder) {
        return {
          status:
            'not_found',
        };
      }

      if (
        lockedOrder.status !==
        'paid'
      ) {
        return {
          status:
            'not_paid',
        };
      }

      const reservationRows =
        await tx
          .select({
            id:
              inventoryReservations.id,

            productId:
              inventoryReservations.productId,

            quantity:
              inventoryReservations.quantity,
          })
          .from(
            inventoryReservations,
          )
          .where(
            and(
              eq(
                inventoryReservations.orderId,
                orderId,
              ),
              eq(
                inventoryReservations.status,
                'active',
              ),
            ),
          )
          .orderBy(
            asc(
              inventoryReservations.productId,
            ),
            asc(
              inventoryReservations.id,
            ),
          )
          .for('update');

      if (
        reservationRows.length ===
        0
      ) {
        return {
          status:
            'already_settled',
        };
      }

      const quantityByProduct =
        new Map<
          string,
          number
        >();

      for (
        const reservation of
        reservationRows
      ) {
        quantityByProduct.set(
          reservation.productId,
          (
            quantityByProduct.get(
              reservation.productId,
            ) ??
            0
          ) +
            reservation.quantity,
        );
      }

      const productIds =
        Array.from(
          quantityByProduct.keys(),
        ).sort();

      const lockedInventory =
        new Map<
          string,
          {
            onHand:
              number;

            reserved:
              number;
          }
        >();

      for (
        const productId of
        productIds
      ) {
        const inventoryRows =
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
                productId,
              ),
            )
            .for('update')
            .limit(1);

        const current =
          inventoryRows[0];

        if (!current) {
          throw new Error(
            'Paid reservation lost its inventory row.',
          );
        }

        const quantity =
          quantityByProduct.get(
            productId,
          );

        if (
          quantity ===
          undefined
        ) {
          throw new Error(
            'Paid reservation quantity was lost.',
          );
        }

        if (
          current.reserved <
          quantity
        ) {
          throw new Error(
            'Paid reservation consumption exceeds reserved inventory.',
          );
        }

        if (
          current.onHand <
          quantity
        ) {
          throw new Error(
            'Paid reservation consumption exceeds on-hand inventory.',
          );
        }

        lockedInventory.set(
          productId,
          {
            onHand:
              current.onHand,

            reserved:
              current.reserved,
          },
        );
      }

      for (
        const productId of
        productIds
      ) {
        const current =
          lockedInventory.get(
            productId,
          );

        const quantity =
          quantityByProduct.get(
            productId,
          );

        if (
          !current ||
          quantity ===
            undefined
        ) {
          throw new Error(
            'Locked paid reservation inventory state was lost.',
          );
        }

        const updatedInventoryRows =
          await tx
            .update(
              inventory,
            )
            .set({
              onHand:
                current.onHand -
                quantity,

              reserved:
                current.reserved -
                quantity,

              updatedAt:
                consumedAt,
            })
            .where(
              eq(
                inventory.productId,
                productId,
              ),
            )
            .returning({
              productId:
                inventory.productId,
            });

        if (
          !updatedInventoryRows[0]
        ) {
          throw new Error(
            'Paid reservation inventory update lost its locked row.',
          );
        }
      }

      for (
        const reservation of
        reservationRows
      ) {
        const updatedReservationRows =
          await tx
            .update(
              inventoryReservations,
            )
            .set({
              status:
                'consumed',
            })
            .where(
              and(
                eq(
                  inventoryReservations.id,
                  reservation.id,
                ),
                eq(
                  inventoryReservations.status,
                  'active',
                ),
              ),
            )
            .returning({
              id:
                inventoryReservations.id,
            });

        if (
          !updatedReservationRows[0]
        ) {
          throw new Error(
            'Paid reservation consumption lost its locked reservation state.',
          );
        }
      }

      await tx
        .insert(
          inventoryMovements,
        )
        .values(
          reservationRows.map(
            (
              reservation,
            ) => ({
              productId:
                reservation.productId,

              type:
                'sale' as const,

              quantityDelta:
                -reservation.quantity,

              referenceType:
                'inventory_reservation',

              referenceId:
                reservation.id,

              note:
                `Paid order consumed ${reservation.quantity} reserved unit(s).`,

              createdAt:
                consumedAt,
            }),
          ),
        );

      return {
        status:
          'consumed',

        reservationsConsumed:
          reservationRows.length,

        unitsConsumed:
          reservationRows.reduce(
            (
              total,
              reservation,
            ) =>
              total +
              reservation.quantity,
            0,
          ),
      };
    },
  );
}
export interface ReleaseCancelledOrderReservationsInput {
  orderId:
    string;

  releasedAt:
    Date;
}

export type ReleaseCancelledOrderReservationsResult =
  | {
      status:
        'released';

      reservationsReleased:
        number;

      unitsReleased:
        number;
    }
  | {
      status:
        'already_settled';
    }
  | {
      status:
        'not_cancelled';
    }
  | {
      status:
        'not_found';
    };

export async function releaseCancelledOrderReservations(
  input:
    ReleaseCancelledOrderReservationsInput,
): Promise<ReleaseCancelledOrderReservationsResult> {
  const orderId =
    input.orderId.trim();

  if (
    !ORDER_ID_PATTERN.test(
      orderId,
    )
  ) {
    throw new Error(
      'Cancelled reservation release requires a valid order UUID.',
    );
  }

  if (
    !isValidDate(
      input.releasedAt,
    )
  ) {
    throw new Error(
      'Cancelled reservation release time must be a valid Date.',
    );
  }

  const releasedAt =
    new Date(
      input.releasedAt.getTime(),
    );

  const database =
    getDatabase();

  return database.transaction(
    async (
      tx,
    ): Promise<ReleaseCancelledOrderReservationsResult> => {
      const lockedOrderRows =
        await tx
          .select({
            id:
              orders.id,

            status:
              orders.status,
          })
          .from(
            orders,
          )
          .where(
            eq(
              orders.id,
              orderId,
            ),
          )
          .for('update')
          .limit(1);

      const lockedOrder =
        lockedOrderRows[0];

      if (!lockedOrder) {
        return {
          status:
            'not_found',
        };
      }

      if (
        lockedOrder.status !==
        'cancelled'
      ) {
        return {
          status:
            'not_cancelled',
        };
      }

      const reservationRows =
        await tx
          .select({
            id:
              inventoryReservations.id,

            productId:
              inventoryReservations.productId,

            quantity:
              inventoryReservations.quantity,
          })
          .from(
            inventoryReservations,
          )
          .where(
            and(
              eq(
                inventoryReservations.orderId,
                orderId,
              ),
              eq(
                inventoryReservations.status,
                'active',
              ),
            ),
          )
          .orderBy(
            asc(
              inventoryReservations.productId,
            ),
            asc(
              inventoryReservations.id,
            ),
          )
          .for('update');

      if (
        reservationRows.length ===
        0
      ) {
        return {
          status:
            'already_settled',
        };
      }

      const releaseByProduct =
        new Map<
          string,
          number
        >();

      for (
        const reservation of
        reservationRows
      ) {
        releaseByProduct.set(
          reservation.productId,
          (
            releaseByProduct.get(
              reservation.productId,
            ) ??
            0
          ) +
            reservation.quantity,
        );
      }

      const productIds =
        Array.from(
          releaseByProduct.keys(),
        ).sort();

      const lockedReserved =
        new Map<
          string,
          number
        >();

      for (
        const productId of
        productIds
      ) {
        const inventoryRows =
          await tx
            .select({
              productId:
                inventory.productId,

              reserved:
                inventory.reserved,
            })
            .from(
              inventory,
            )
            .where(
              eq(
                inventory.productId,
                productId,
              ),
            )
            .for('update')
            .limit(1);

        const current =
          inventoryRows[0];

        if (!current) {
          throw new Error(
            'Cancelled reservation lost its inventory row.',
          );
        }

        const releaseQuantity =
          releaseByProduct.get(
            productId,
          );

        if (
          releaseQuantity ===
          undefined
        ) {
          throw new Error(
            'Cancelled reservation release quantity was lost.',
          );
        }

        if (
          current.reserved <
          releaseQuantity
        ) {
          throw new Error(
            'Cancelled reservation release exceeds reserved inventory.',
          );
        }

        lockedReserved.set(
          productId,
          current.reserved,
        );
      }

      for (
        const productId of
        productIds
      ) {
        const currentReserved =
          lockedReserved.get(
            productId,
          );

        const releaseQuantity =
          releaseByProduct.get(
            productId,
          );

        if (
          currentReserved ===
            undefined ||
          releaseQuantity ===
            undefined
        ) {
          throw new Error(
            'Locked cancelled reservation release state was lost.',
          );
        }

        const updatedInventoryRows =
          await tx
            .update(
              inventory,
            )
            .set({
              reserved:
                currentReserved -
                releaseQuantity,

              updatedAt:
                releasedAt,
            })
            .where(
              eq(
                inventory.productId,
                productId,
              ),
            )
            .returning({
              productId:
                inventory.productId,
            });

        if (
          !updatedInventoryRows[0]
        ) {
          throw new Error(
            'Cancelled reservation inventory update lost its locked row.',
          );
        }
      }

      for (
        const reservation of
        reservationRows
      ) {
        const updatedReservationRows =
          await tx
            .update(
              inventoryReservations,
            )
            .set({
              status:
                'released',

              releasedAt,
            })
            .where(
              and(
                eq(
                  inventoryReservations.id,
                  reservation.id,
                ),
                eq(
                  inventoryReservations.status,
                  'active',
                ),
              ),
            )
            .returning({
              id:
                inventoryReservations.id,
            });

        if (
          !updatedReservationRows[0]
        ) {
          throw new Error(
            'Cancelled reservation release lost its locked reservation state.',
          );
        }
      }

      await tx
        .insert(
          inventoryMovements,
        )
        .values(
          reservationRows.map(
            (
              reservation,
            ) => ({
              productId:
                reservation.productId,

              type:
                'reservation_release' as const,

              quantityDelta:
                0,

              referenceType:
                'inventory_reservation',

              referenceId:
                reservation.id,

              note:
                `Cancelled order released ${reservation.quantity} reserved unit(s); on-hand inventory unchanged.`,

              createdAt:
                releasedAt,
            }),
          ),
        );

      return {
        status:
          'released',

        reservationsReleased:
          reservationRows.length,

        unitsReleased:
          reservationRows.reduce(
            (
              total,
              reservation,
            ) =>
              total +
              reservation.quantity,
            0,
          ),
      };
    },
  );
}