import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  inventory,
  inventoryMovements,
  products,
} from '../db/schema.ts';

import type {
  AdminInventoryListQuery,
} from './read-model.ts';

export interface AdminInventoryListItem {
  productId: string;
  productName: string;
  brand: string;
  partNumber: string;
  sku: string | null;
  onHand: number;
  reserved: number;
  available: number;
  inventoryUpdatedAt: Date | null;
}

export interface AdminInventoryListResult {
  items:
    AdminInventoryListItem[];

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
      'Admin inventory pagination offset is outside the safe integer range.',
    );
  }

  return offset;
}

export async function listAdminInventory(
  query: AdminInventoryListQuery,
): Promise<AdminInventoryListResult> {
  const database =
    getDatabase();

  const searchCondition =
    query.q
      ? (() => {
          const pattern =
            createSearchPattern(
              query.q,
            );

          return or(
            ilike(
              products.name,
              pattern,
            ),
            ilike(
              products.brand,
              pattern,
            ),
            ilike(
              products.partNumber,
              pattern,
            ),
            ilike(
              products.sku,
              pattern,
            ),
          );
        })()
      : undefined;

  const inventoryStatusCondition =
    query.inventoryStatus ===
    'in-stock'
      ? sql`
          coalesce(
            ${inventory.onHand},
            0
          ) > 0
        `
      : query.inventoryStatus ===
          'out-of-stock'
        ? sql`
            coalesce(
              ${inventory.onHand},
              0
            ) = 0
          `
        : undefined;

  const whereCondition =
    and(
      searchCondition,
      inventoryStatusCondition,
    );

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
          productId:
            products.id,

          productName:
            products.name,

          brand:
            products.brand,

          partNumber:
            products.partNumber,

          sku:
            products.sku,

          onHand:
            inventory.onHand,

          reserved:
            inventory.reserved,

          inventoryUpdatedAt:
            inventory.updatedAt,
        })
        .from(
          products,
        )
        .leftJoin(
          inventory,
          sql`
            ${inventory.productId}
            =
            ${products.id}
          `,
        )
        .where(
          whereCondition,
        )
        .orderBy(
          desc(
            products.createdAt,
          ),
          desc(
            products.id,
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
          products,
        )
        .leftJoin(
          inventory,
          sql`
            ${inventory.productId}
            =
            ${products.id}
          `,
        )
        .where(
          whereCondition,
        ),
    ]);

  const items =
    rows.map(
      (row) => {
        const onHand =
          row.onHand ?? 0;

        const reserved =
          row.reserved ?? 0;

        return {
          ...row,
          onHand,
          reserved,
          available:
            onHand - reserved,
        } as AdminInventoryListItem;
      },
    );

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
    items,
    total,
    page:
      query.page,
    pageSize:
      query.pageSize,
    totalPages,
  };
}
export interface AdminInventoryMovementListItem {
  id: string;
  productId: string;
  productName: string;
  partNumber: string;
  type:
    (typeof inventoryMovements.$inferSelect)['type'];
  quantityDelta: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: Date;
}

const ADMIN_INVENTORY_HISTORY_LIMIT =
  25;

export async function listRecentAdminInventoryMovements():
  Promise<AdminInventoryMovementListItem[]> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        id:
          inventoryMovements.id,

        productId:
          inventoryMovements.productId,

        productName:
          products.name,

        partNumber:
          products.partNumber,

        type:
          inventoryMovements.type,

        quantityDelta:
          inventoryMovements.quantityDelta,

        referenceType:
          inventoryMovements.referenceType,

        referenceId:
          inventoryMovements.referenceId,

        note:
          inventoryMovements.note,

        createdAt:
          inventoryMovements.createdAt,
      })
      .from(
        inventoryMovements,
      )
      .innerJoin(
        products,
        eq(
          products.id,
          inventoryMovements.productId,
        ),
      )
      .orderBy(
        desc(
          inventoryMovements.createdAt,
        ),
        desc(
          inventoryMovements.id,
        ),
      )
      .limit(
        ADMIN_INVENTORY_HISTORY_LIMIT,
      );

  return rows as
    AdminInventoryMovementListItem[];
}
export interface AdminInventorySummary {
  outOfStock: number;
}

export async function getAdminInventorySummary():
  Promise<AdminInventorySummary> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        outOfStock:
          count(),
      })
      .from(
        products,
      )
      .leftJoin(
        inventory,
        sql`
          ${inventory.productId}
          =
          ${products.id}
        `,
      )
      .where(
        sql`
          coalesce(
            ${inventory.onHand},
            0
          ) = 0
        `,
      );

  return {
    outOfStock:
      rows[0]?.outOfStock ??
      0,
  };
}
