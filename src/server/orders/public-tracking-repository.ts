import {
  and,
  eq,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  orders,
} from '../db/schema.ts';

export interface PublicOrderTrackingRecord {
  orderNumber:
    string;

  status:
    typeof orders.$inferSelect.status;

  createdAt:
    Date;

  updatedAt:
    Date;

  paidAt:
    Date | null;
}

export async function findPublicOrderTracking(
  orderNumber:
    string,

  customerPhone:
    string,
): Promise<PublicOrderTrackingRecord | null> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        orderNumber:
          orders.orderNumber,

        status:
          orders.status,

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
        and(
          eq(
            orders.orderNumber,
            orderNumber,
          ),

          eq(
            orders.customerPhone,
            customerPhone,
          ),
        ),
      )
      .limit(1);

  return rows[0] ?? null;
}