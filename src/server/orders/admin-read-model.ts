import {
  listAdminOrders,
} from "./repository.ts";

import type {
  AdminOrderStatus,
} from "./read-model.ts";

export interface AdminOrderSnapshotItem {
  id: string;
  status: AdminOrderStatus;
  customerName: string;
  customerPhone: string;
  totalRial: number | null;
  createdAt: string;
  updatedAt: string;
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

  return {
    items:
      result.items.map(
        (order) => ({
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
        }),
      ),

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
