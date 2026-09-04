import {
  listAdminOrders,
} from "./repository.ts";

import type {
  AdminOrderStatus,
} from "./read-model.ts";

import {
  getRefundsByOrderId,
} from "../refunds/repository.ts";

export interface AdminOrderSnapshotItem {
  id: string;
  status: AdminOrderStatus;
  customerName: string;
  customerPhone: string;
  totalRial: number | null;
  createdAt: string;
  updatedAt: string;

  refundCount: number;
  refundedAmountRial: number;
  latestRefundStatus: string | null;
}

export interface AdminOrdersSnapshot {
  items: AdminOrderSnapshotItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAdminOrdersSnapshot(
  query: {
    q: string;
    status: AdminOrderStatus | null;
    page: number;
    pageSize: number;
  },
): Promise<AdminOrdersSnapshot> {
  const result =
    await listAdminOrders(
      query,
    );

  const items =
    await Promise.all(
      result.items.map(
        async (order) => {

          const refunds =
            await getRefundsByOrderId(
              order.id,
            );

          const completedRefunds =
            refunds.filter(
              (refund) =>
                refund.status === "completed",
            );

          return {
          id:
            order.id,

          status:
            order.status,

          customerName:
            order.customerName,

          customerPhone:
            order.customerPhone,

          totalRial:
            order.totalRial,

          createdAt:
            order.createdAt.toISOString(),

          updatedAt:
            order.createdAt.toISOString(),

          refundCount:
            refunds.length,

          refundedAmountRial:
            completedRefunds.reduce(
              (
                total,
                refund,
              ) =>
                total +
                refund.amountRial,
              0,
            ),

          latestRefundStatus:
            refunds.length > 0
              ? refunds[refunds.length - 1].status
              : null,
        };
        },
      ),
    );

  return {
    items,

    total:
      result.total,

    page:
      result.page,

    pageSize:
      result.pageSize,

    totalPages:
      result.totalPages,
  };
}

