import {
  and,
  count,
  desc,
  eq,
  gte,
  lt,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  orderStatusHistory,
  orders,
} from '../db/schema.ts';

import {
  getAdminInventorySummary,
} from '../inventory/repository.ts';

import type {
  AdminOrderStatus,
} from '../orders/read-model.ts';

import {
  getAdminDashboardTehranDayRange,
} from './read-model.ts';

export interface AdminDashboardActions {
  readyToShip: number;
  needsProcessing: number;
  outOfStock: number;
}

export interface AdminDashboardToday {
  newOrders: number;
  readyToShip: number;
  shipped: number;
}

export interface AdminDashboardRecentOrder {
  id: string;
  orderNumber: string;
  status: AdminOrderStatus;
  customerName: string;
  totalRial: number | null;
  currency: string;
  createdAt: Date;
}

export interface AdminDashboardSnapshot {
  actions: AdminDashboardActions;
  today: AdminDashboardToday;
  recentOrders:
    AdminDashboardRecentOrder[];
}

const ADMIN_DASHBOARD_RECENT_ORDER_LIMIT =
  5;

async function countOrdersByStatus(
  status: AdminOrderStatus,
): Promise<number> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        total:
          count(),
      })
      .from(
        orders,
      )
      .where(
        eq(
          orders.status,
          status,
        ),
      );

  return (
    rows[0]?.total ??
    0
  );
}

async function countOrdersCreatedInRange(
  start: Date,
  end: Date,
): Promise<number> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        total:
          count(),
      })
      .from(
        orders,
      )
      .where(
        and(
          gte(
            orders.createdAt,
            start,
          ),
          lt(
            orders.createdAt,
            end,
          ),
        ),
      );

  return (
    rows[0]?.total ??
    0
  );
}

async function countStatusTransitionsInRange(
  status: AdminOrderStatus,
  start: Date,
  end: Date,
): Promise<number> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        total:
          count(),
      })
      .from(
        orderStatusHistory,
      )
      .where(
        and(
          eq(
            orderStatusHistory.toStatus,
            status,
          ),
          gte(
            orderStatusHistory.createdAt,
            start,
          ),
          lt(
            orderStatusHistory.createdAt,
            end,
          ),
        ),
      );

  return (
    rows[0]?.total ??
    0
  );
}

async function listRecentDashboardOrders():
  Promise<AdminDashboardRecentOrder[]> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        id:
          orders.id,
        orderNumber:
          orders.orderNumber,
        status:
          orders.status,
        customerName:
          orders.customerName,
        totalRial:
          orders.totalRial,
        currency:
          orders.currency,
        createdAt:
          orders.createdAt,
      })
      .from(
        orders,
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
        ADMIN_DASHBOARD_RECENT_ORDER_LIMIT,
      );

  return rows as
    AdminDashboardRecentOrder[];
}

export async function getAdminDashboardSnapshot(
  now: Date = new Date(),
): Promise<AdminDashboardSnapshot> {
  const {
    start,
    end,
  } =
    getAdminDashboardTehranDayRange(
      now,
    );

  const [
    readyToShip,
    needsProcessing,
    inventorySummary,
    newOrders,
    readyToShipToday,
    shippedToday,
    recentOrders,
  ] =
    await Promise.all([
      countOrdersByStatus(
        'ready_to_ship',
      ),
      countOrdersByStatus(
        'paid',
      ),
      getAdminInventorySummary(),
      countOrdersCreatedInRange(
        start,
        end,
      ),
      countStatusTransitionsInRange(
        'ready_to_ship',
        start,
        end,
      ),
      countStatusTransitionsInRange(
        'shipped',
        start,
        end,
      ),
      listRecentDashboardOrders(),
    ]);

  return {
    actions: {
      readyToShip,
      needsProcessing,
      outOfStock:
        inventorySummary.outOfStock,
    },
    today: {
      newOrders,
      readyToShip:
        readyToShipToday,
      shipped:
        shippedToday,
    },
    recentOrders,
  };
}
