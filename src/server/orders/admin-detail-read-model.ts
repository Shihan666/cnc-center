import {
  getAdminOrderById,
} from "./repository.ts";

import type {
  AdminOrderStatus,
} from "./read-model.ts";

import {
  getRefundsByOrderId,
} from "../refunds/repository.ts";

export interface AdminOrderDetailSnapshot {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;

  customerName: string;
  customerPhone: string;
  customerCity: string;
  customerAddress: string;

  subtotalRial: number;
  shippingFeeRial: number | null;
  totalRial: number | null;
  currency: string;

  paymentReady: boolean;

  createdAt: string;
  updatedAt: string;
  paidAt: string | null;

  items: Array<{
    id: string;
    productId: string;
    productName: string;
    brand: string;
    partNumber: string;
    quantity: number;
    unitPriceRial: number;
    lineTotalRial: number;
    shippingClass: string;
    createdAt: string;
  }>;

  payments: Array<{
    id: string;
    provider: string;
    environment: string;
    status: string;
    amountRial: number;
    currency: string;
    refId: string | null;
    createdAt: string;
  }>;

  refunds: Array<{
    id: string;
    paymentId: string;
    amountRial: number;
    status: string;
    reason: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;

  statusHistory: Array<{
    id: string;
    fromStatus: AdminOrderStatus | null;
    toStatus: AdminOrderStatus;
    reason: string | null;
    createdAt: string;
  }>;
}

export async function getAdminOrderDetailSnapshot(
  orderId: string,
): Promise<AdminOrderDetailSnapshot | null> {
  const order =
    await getAdminOrderById(
      orderId,
    );

  if (!order) {
    return null;
  }

  const refunds =
    await getRefundsByOrderId(
      orderId,
    );

  return {
    id:
      order.id,

    orderNumber:
      order.orderNumber,

    status:
      order.status,

    customerName:
      order.customerName,

    customerPhone:
      order.customerPhone,

    customerCity:
      order.customerCity,

    customerAddress:
      order.customerAddress,

    subtotalRial:
      order.subtotalRial,

    shippingFeeRial:
      order.shippingFeeRial,

    totalRial:
      order.totalRial,

    currency:
      order.currency,

    paymentReady:
      order.paymentReady,

    createdAt:
      order.createdAt.toISOString(),

    updatedAt:
      order.updatedAt.toISOString(),

    paidAt:
      order.paidAt
        ? order.paidAt.toISOString()
        : null,

    items:
      order.items.map(
        (item) => ({
          ...item,
          createdAt:
            item.createdAt.toISOString(),
        }),
      ),

    payments:
      order.payments.map(
        (payment) => ({
          id:
            payment.id,

          provider:
            payment.provider,

          environment:
            payment.environment,

          status:
            payment.status,

          amountRial:
            payment.amountRial,

          currency:
            payment.currency,

          refId:
            payment.refId,

          createdAt:
            payment.createdAt.toISOString(),
        }),
      ),

    refunds:
      refunds.map(
        (refund) => ({
          id:
            refund.id,

          paymentId:
            refund.paymentId,

          amountRial:
            refund.amountRial,

          status:
            refund.status,

          reason:
            refund.reason,

          createdAt:
            refund.createdAt.toISOString(),

          completedAt:
            refund.completedAt
              ? refund.completedAt.toISOString()
              : null,
        }),
      ),

    statusHistory:
      order.statusHistory.map(
        (history) => ({
          ...history,
          createdAt:
            history.createdAt.toISOString(),
        }),
      ),
  };
}

