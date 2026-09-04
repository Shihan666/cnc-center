export const ADMIN_INVENTORY_DEFAULT_PAGE =
  1;

export const ADMIN_INVENTORY_DEFAULT_PAGE_SIZE =
  25;

export const ADMIN_INVENTORY_MAX_PAGE_SIZE =
  100;

export const ADMIN_INVENTORY_MAX_SAFE_PAGE =
  Math.floor(
    Number.MAX_SAFE_INTEGER /
    ADMIN_INVENTORY_MAX_PAGE_SIZE,
  );

export const ADMIN_INVENTORY_STATUSES = [
  'all',
  'in-stock',
  'out-of-stock',
] as const;

export type AdminInventoryStatus =
  (typeof ADMIN_INVENTORY_STATUSES)[number];

export interface AdminInventoryListQuery {
  q: string;
  inventoryStatus:
    AdminInventoryStatus;
  page: number;
  pageSize: number;
}

function normalizeSearchText(
  value: string | null,
): string {
  return (
    value
      ?.trim()
      .replace(/\s+/g, ' ')
      .slice(0, 200) ??
    ''
  );
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!value) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    return fallback;
  }

  return parsed;
}

function parseInventoryStatus(
  value: string | null,
): AdminInventoryStatus {
  if (
    value === 'in-stock' ||
    value === 'out-of-stock'
  ) {
    return value;
  }

  return 'all';
}

export function parseAdminInventoryListQuery(
  searchParams: URLSearchParams,
): AdminInventoryListQuery {
  const q =
    normalizeSearchText(
      searchParams.get('q'),
    );

  const inventoryStatus =
    parseInventoryStatus(
      searchParams.get(
        'inventoryStatus',
      ),
    );

  const page =
    parsePositiveInteger(
      searchParams.get('page'),
      ADMIN_INVENTORY_DEFAULT_PAGE,
      ADMIN_INVENTORY_MAX_SAFE_PAGE,
    );

  const requestedPageSize =
    parsePositiveInteger(
      searchParams.get('pageSize'),
      ADMIN_INVENTORY_DEFAULT_PAGE_SIZE,
    );

  const pageSize =
    Math.min(
      requestedPageSize,
      ADMIN_INVENTORY_MAX_PAGE_SIZE,
    );

  return {
    q,
    inventoryStatus,
    page,
    pageSize,
  };
}
