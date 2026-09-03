import {
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
  orders,
} from '../db/schema.ts';

import type {
  AdminCustomerListQuery,
} from './read-model.ts';

export interface AdminCustomerListItem {
  customerPhone: string;
  customerName: string;
  customerCity: string;

  orderCount: number;

  latestOrderId: string;
  latestOrderNumber: string;
  latestOrderAt: Date;
}

export interface AdminCustomerListResult {
  items:
    AdminCustomerListItem[];

  total:
    number;

  page:
    number;

  pageSize:
    number;

  totalPages:
    number;
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
      'Admin customer pagination offset is outside the safe integer range.',
    );
  }

  return offset;
}

export async function listAdminCustomers(
  query: AdminCustomerListQuery,
): Promise<AdminCustomerListResult> {
  const database =
    getDatabase();

  const customerAggregate =
    database
      .select({
        customerPhone:
          orders.customerPhone,

        orderCount:
          count().as(
            'order_count',
          ),
      })
      .from(
        orders,
      )
      .groupBy(
        orders.customerPhone,
      )
      .as(
        'customer_aggregate',
      );

  const latestCustomerOrder =
    database
      .selectDistinctOn(
        [
          orders.customerPhone,
        ],
        {
          customerPhone:
            orders.customerPhone,

          customerName:
            orders.customerName,

          customerCity:
            orders.customerCity,

          latestOrderId:
            orders.id,

          latestOrderNumber:
            orders.orderNumber,

          latestOrderAt:
            orders.createdAt,
        },
      )
      .from(
        orders,
      )
      .orderBy(
        orders.customerPhone,
        desc(
          orders.createdAt,
        ),
        desc(
          orders.id,
        ),
      )
      .as(
        'latest_customer_order',
      );

  const searchCondition =
    query.q
      ? (() => {
          const pattern =
            createSearchPattern(
              query.q,
            );

          return or(
            ilike(
              latestCustomerOrder.customerName,
              pattern,
            ),
            ilike(
              latestCustomerOrder.customerPhone,
              pattern,
            ),
            ilike(
              latestCustomerOrder.customerCity,
              pattern,
            ),
            ilike(
              latestCustomerOrder.latestOrderNumber,
              pattern,
            ),
          );
        })()
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
          customerPhone:
            customerAggregate.customerPhone,

          customerName:
            latestCustomerOrder.customerName,

          customerCity:
            latestCustomerOrder.customerCity,

          orderCount:
            customerAggregate.orderCount,

          latestOrderId:
            latestCustomerOrder.latestOrderId,

          latestOrderNumber:
            latestCustomerOrder.latestOrderNumber,

          latestOrderAt:
            latestCustomerOrder.latestOrderAt,
        })
        .from(
          customerAggregate,
        )
        .innerJoin(
          latestCustomerOrder,
          eq(
            latestCustomerOrder.customerPhone,
            customerAggregate.customerPhone,
          ),
        )
        .where(
          searchCondition,
        )
        .orderBy(
          desc(
            latestCustomerOrder.latestOrderAt,
          ),
          desc(
            latestCustomerOrder.latestOrderId,
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
          customerAggregate,
        )
        .innerJoin(
          latestCustomerOrder,
          eq(
            latestCustomerOrder.customerPhone,
            customerAggregate.customerPhone,
          ),
        )
        .where(
          searchCondition,
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
        AdminCustomerListItem[],

    total,

    page:
      query.page,

    pageSize:
      query.pageSize,

    totalPages,
  };
}