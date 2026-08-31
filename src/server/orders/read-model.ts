export const ADMIN_ORDER_STATUSES = [
  'pending',
  'awaiting_payment',
  'paid',
  'processing',
  'ready_to_ship',
  'shipped',
  'completed',
  'cancelled',
  'expired',
] as const;

export type AdminOrderStatus =
  typeof ADMIN_ORDER_STATUSES[number];

export const ADMIN_ORDER_DEFAULT_PAGE =
  1;

export const ADMIN_ORDER_DEFAULT_PAGE_SIZE =
  25;

export const ADMIN_ORDER_MAX_PAGE_SIZE =
  100;

export const ADMIN_ORDER_MAX_SAFE_PAGE =
  Math.floor(
    Number.MAX_SAFE_INTEGER /
    ADMIN_ORDER_MAX_PAGE_SIZE,
  );

export interface AdminOrderListQuery {
  q: string;
  status:
    AdminOrderStatus | null;
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

export function isAdminOrderId(
  value: string,
): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  ).test(
    value.trim(),
  );
}

export function isAdminOrderStatus(
  value: string,
): value is AdminOrderStatus {
  return (
    ADMIN_ORDER_STATUSES as
      readonly string[]
  ).includes(value);
}

export function parseAdminOrderListQuery(
  searchParams: URLSearchParams,
): AdminOrderListQuery {
  const q =
    normalizeSearchText(
      searchParams.get('q'),
    );

  const rawStatus =
    searchParams
      .get('status')
      ?.trim() ??
    '';

  const status =
    rawStatus &&
    rawStatus !== 'all' &&
    isAdminOrderStatus(rawStatus)
      ? rawStatus
      : null;

  const page =
    parsePositiveInteger(
      searchParams.get('page'),
      ADMIN_ORDER_DEFAULT_PAGE,
      ADMIN_ORDER_MAX_SAFE_PAGE,
    );

  const requestedPageSize =
    parsePositiveInteger(
      searchParams.get('pageSize'),
      ADMIN_ORDER_DEFAULT_PAGE_SIZE,
    );

  const pageSize =
    Math.min(
      requestedPageSize,
      ADMIN_ORDER_MAX_PAGE_SIZE,
    );

  return {
    q,
    status,
    page,
    pageSize,
  };
}