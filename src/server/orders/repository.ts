import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  orderItems,
  orderStatusHistory,
  orders,
  payments,
} from '../db/schema.ts';

import type {
  AdminOrderListQuery,
  AdminOrderStatus,
} from './read-model.ts';

import {
  isAdminOrderId,
} from './read-model.ts';

import {
  canAdminTransitionOrderStatus,
} from './status-policy.ts';

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;

  customerName: string;
  customerPhone: string;
  customerCity: string;

  subtotalRial: number;
  shippingFeeRial: number | null;
  totalRial: number | null;
  currency: string;

  paymentReady: boolean;

  createdAt: Date;
  paidAt: Date | null;
}

export interface AdminOrderListResult {
  items:
    AdminOrderListItem[];

  total:
    number;

  page:
    number;

  pageSize:
    number;

  totalPages:
    number;
}

export interface AdminOrderDetailItem {
  id: string;
  productId: string;

  productName: string;
  brand: string;
  partNumber: string;

  quantity: number;

  unitPriceRial: number;
  lineTotalRial: number;

  shippingClass: string;
  createdAt: Date;
}

export interface AdminOrderPayment {
  id: string;

  provider: string;
  environment: string;
  status: string;

  amountRial: number;
  currency: string;

  refId: string | null;

  createdAt: Date;
  requestedAt: Date | null;
  verifiedAt: Date | null;
  failedAt: Date | null;
}

export interface AdminOrderStatusHistoryItem {
  id: string;

  fromStatus:
    AdminOrderStatus | null;

  toStatus:
    AdminOrderStatus;

  reason:
    string | null;

  createdAt:
    Date;
}

export interface AdminOrderDetail {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;

  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;
  customerNotes: string;

  shippingMethodId: string;
  shippingMethodLabel: string;

  subtotalRial: number;
  shippingFeeRial: number | null;
  totalRial: number | null;
  currency: string;

  paymentReady: boolean;

  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;

  items:
    AdminOrderDetailItem[];

  payments:
    AdminOrderPayment[];

  statusHistory:
    AdminOrderStatusHistoryItem[];
}

function createSearchPattern(
  query: string,
): string {
  const escaped =
    query
      .replaceAll(
        '\\',
        '\\\\',
      )
      .replaceAll(
        '%',
        '\\%',
      )
      .replaceAll(
        '_',
        '\\_',
      );

  return `%${escaped}%`;
}

function getPaginationOffset(
  page: number,
  pageSize: number,
): number {
  const offset =
    (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new RangeError(
      'Admin order pagination offset is outside the safe integer range.',
    );
  }

  return offset;
}

export async function listAdminOrders(
  query: AdminOrderListQuery,
): Promise<AdminOrderListResult> {
  const database =
    getDatabase();

  const conditions = [];

  if (query.status) {
    conditions.push(
      eq(
        orders.status,
        query.status,
      ),
    );
  }

  if (query.q) {
    const pattern =
      createSearchPattern(
        query.q,
      );

    conditions.push(
      or(
        ilike(
          orders.orderNumber,
          pattern,
        ),
        ilike(
          orders.customerName,
          pattern,
        ),
        ilike(
          orders.customerPhone,
          pattern,
        ),
        ilike(
          orders.customerCity,
          pattern,
        ),
      ),
    );
  }

  const whereClause =
    conditions.length > 0
      ? and(...conditions)
      : undefined;

  const offset =
    getPaginationOffset(
      query.page,
      query.pageSize,
    );

  const [
    rows,
    totalRows,
  ] =
    await Promise.all([
      database
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          status:
            orders.status,

          customerName:
            orders.customerName,

          customerPhone:
            orders.customerPhone,

          customerCity:
            orders.customerCity,

          subtotalRial:
            orders.subtotalRial,

          shippingFeeRial:
            orders.shippingFeeRial,

          totalRial:
            orders.totalRial,

          currency:
            orders.currency,

          paymentReady:
            orders.paymentReady,

          createdAt:
            orders.createdAt,

          paidAt:
            orders.paidAt,
        })
        .from(
          orders,
        )
        .where(
          whereClause,
        )
        .orderBy(
          desc(
            orders.createdAt,
          ),
          desc(
            orders.id,
          ),
        )
        .limit(
          query.pageSize,
        )
        .offset(
          offset,
        ),

      database
        .select({
          value:
            count(),
        })
        .from(
          orders,
        )
        .where(
          whereClause,
        ),
    ]);

  const total =
    totalRows[0]?.value ??
    0;

  const totalPages =
    total === 0
      ? 0
      : Math.ceil(
          total /
          query.pageSize,
        );

  return {
    items:
      rows as
        AdminOrderListItem[],

    total,
    page:
      query.page,
    pageSize:
      query.pageSize,
    totalPages,
  };
}
export async function getAdminOrderById(
  orderId: string,
): Promise<AdminOrderDetail | null> {
  const normalizedOrderId =
    orderId.trim();

  if (
    !isAdminOrderId(
      normalizedOrderId,
    )
  ) {
    return null;
  }

  const database =
    getDatabase();

  const [
    orderRows,
    itemRows,
    paymentRows,
    historyRows,
  ] =
    await Promise.all([
      database
        .select({
          id:
            orders.id,

          orderNumber:
            orders.orderNumber,

          status:
            orders.status,

          customerName:
            orders.customerName,

          customerPhone:
            orders.customerPhone,

          customerCity:
            orders.customerCity,

          customerAddress:
            orders.customerAddress,

          customerNotes:
            orders.customerNotes,

          shippingMethodId:
            orders.shippingMethodId,

          shippingMethodLabel:
            orders.shippingMethodLabel,

          subtotalRial:
            orders.subtotalRial,

          shippingFeeRial:
            orders.shippingFeeRial,

          totalRial:
            orders.totalRial,

          currency:
            orders.currency,

          paymentReady:
            orders.paymentReady,

          createdAt:
            orders.createdAt,

          updatedAt:
            orders.updatedAt,

          paidAt:
            orders.paidAt,
        })
        .from(
          orders,
        )
        .where(
          eq(
            orders.id,
            normalizedOrderId,
          ),
        )
        .limit(1),

      database
        .select({
          id:
            orderItems.id,

          productId:
            orderItems.productId,

          productName:
            orderItems.productName,

          brand:
            orderItems.brand,

          partNumber:
            orderItems.partNumber,

          quantity:
            orderItems.quantity,

          unitPriceRial:
            orderItems.unitPriceRial,

          lineTotalRial:
            orderItems.lineTotalRial,

          shippingClass:
            orderItems.shippingClass,

          createdAt:
            orderItems.createdAt,
        })
        .from(
          orderItems,
        )
        .where(
          eq(
            orderItems.orderId,
            normalizedOrderId,
          ),
        )
        .orderBy(
          asc(
            orderItems.createdAt,
          ),
          asc(
            orderItems.id,
          ),
        ),

      database
        .select({
          id:
            payments.id,

          provider:
            payments.provider,

          environment:
            payments.environment,

          status:
            payments.status,

          amountRial:
            payments.amountRial,

          currency:
            payments.currency,

          refId:
            payments.refId,

          createdAt:
            payments.createdAt,

          requestedAt:
            payments.requestedAt,

          verifiedAt:
            payments.verifiedAt,

          failedAt:
            payments.failedAt,
        })
        .from(
          payments,
        )
        .where(
          eq(
            payments.orderId,
            normalizedOrderId,
          ),
        )
        .orderBy(
          desc(
            payments.createdAt,
          ),
          desc(
            payments.id,
          ),
        ),

      database
        .select({
          id:
            orderStatusHistory.id,

          fromStatus:
            orderStatusHistory.fromStatus,

          toStatus:
            orderStatusHistory.toStatus,

          reason:
            orderStatusHistory.reason,

          createdAt:
            orderStatusHistory.createdAt,
        })
        .from(
          orderStatusHistory,
        )
        .where(
          eq(
            orderStatusHistory.orderId,
            normalizedOrderId,
          ),
        )
        .orderBy(
          asc(
            orderStatusHistory.createdAt,
          ),
          asc(
            orderStatusHistory.id,
          ),
        ),
    ]);

  const order =
    orderRows[0];

  if (!order) {
    return null;
  }

  return {
    ...order,

    items:
      itemRows as
        AdminOrderDetailItem[],

    payments:
      paymentRows as
        AdminOrderPayment[],

    statusHistory:
      historyRows as
        AdminOrderStatusHistoryItem[],
  };
}
export interface AdminOrderStatusTransitionInput {
  orderId: string;

  toStatus:
    AdminOrderStatus;

  reason:
    string | null;

  changedAt:
    Date;
}

export type AdminOrderStatusTransitionResult =
  | {
      status:
        'not_found';
    }
  | {
      status:
        'invalid_transition';

      fromStatus:
        AdminOrderStatus;

      toStatus:
        AdminOrderStatus;
    }
  | {
      status:
        'updated';

      orderId:
        string;

      fromStatus:
        AdminOrderStatus;

      toStatus:
        AdminOrderStatus;

      updatedAt:
        Date;

      historyId:
        string;

      historyCreatedAt:
        Date;
    };

export async function transitionAdminOrderStatus(
  input: AdminOrderStatusTransitionInput,
): Promise<AdminOrderStatusTransitionResult> {
  const normalizedOrderId =
    input.orderId.trim();

  if (
    !isAdminOrderId(
      normalizedOrderId,
    )
  ) {
    return {
      status:
        'not_found',
    };
  }

  if (
    !(input.changedAt instanceof Date) ||
    Number.isNaN(
      input.changedAt.getTime(),
    )
  ) {
    throw new Error(
      'Order status transition time must be a valid Date.',
    );
  }

  const database =
    getDatabase();

  return database.transaction(
    async (tx) => {
      const lockedRows =
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
              normalizedOrderId,
            ),
          )
          .for('update')
          .limit(1);

      const lockedOrder =
        lockedRows[0];

      if (!lockedOrder) {
        return {
          status:
            'not_found',
        };
      }

      const fromStatus =
        lockedOrder.status as
          AdminOrderStatus;

      if (
        !canAdminTransitionOrderStatus(
          fromStatus,
          input.toStatus,
        )
      ) {
        return {
          status:
            'invalid_transition',

          fromStatus,

          toStatus:
            input.toStatus,
        };
      }

      const changedAt =
        new Date(
          input.changedAt.getTime(),
        );

      const updatedRows =
        await tx
          .update(
            orders,
          )
          .set({
            status:
              input.toStatus,

            updatedAt:
              changedAt,
          })
          .where(
            and(
              eq(
                orders.id,
                normalizedOrderId,
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

            status:
              orders.status,

            updatedAt:
              orders.updatedAt,
          });

      const updatedOrder =
        updatedRows[0];

      if (!updatedOrder) {
        throw new Error(
          'Order status update lost its locked state.',
        );
      }

      const historyRows =
        await tx
          .insert(
            orderStatusHistory,
          )
          .values({
            orderId:
              normalizedOrderId,

            fromStatus,

            toStatus:
              input.toStatus,

            reason:
              input.reason,

            createdAt:
              changedAt,
          })
          .returning({
            id:
              orderStatusHistory.id,

            createdAt:
              orderStatusHistory.createdAt,
          });

      const history =
        historyRows[0];

      if (!history) {
        throw new Error(
          'Order status history insert did not return a row.',
        );
      }

      return {
        status:
          'updated',

        orderId:
          updatedOrder.id,

        fromStatus,

        toStatus:
          updatedOrder.status as
            AdminOrderStatus,

        updatedAt:
          updatedOrder.updatedAt,

        historyId:
          history.id,

        historyCreatedAt:
          history.createdAt,
      };
    },
  );
}

export async function markOrderPaidAfterPayment(
  orderId: string,
) {
  const database =
    getDatabase();

  return database.transaction(
    async (tx) => {
      const locked =
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
          .for("update")
          .limit(1);

      const order =
        locked[0];

      if (!order) {
        throw new Error(
          "Order not found.",
        );
      }

      if (
        order.status === "paid"
      ) {
        return order;
      }

      if (
        order.status !== "pending"
      ) {
        throw new Error(
          "Order cannot be paid from current status.",
        );
      }

      const paidAt =
        new Date();

      const updated =
        await tx
          .update(
            orders,
          )
          .set({
            status:
              "paid",

            paidAt,

            updatedAt:
              paidAt,
          })
          .where(
            eq(
              orders.id,
              orderId,
            ),
          )
          .returning();

      const updatedOrder =
        updated[0];

      if (!updatedOrder) {
        throw new Error(
          "Order payment update failed.",
        );
      }

      await tx
        .insert(
          orderStatusHistory,
        )
        .values({
          orderId,

          fromStatus:
            order.status,

          toStatus:
            "paid",

          reason:
            "payment_verified",

          createdAt:
            paidAt,
        });

      return updatedOrder;
    },
  );
}

