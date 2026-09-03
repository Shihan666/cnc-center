export const ADMIN_CUSTOMER_DEFAULT_PAGE =
  1;

export const ADMIN_CUSTOMER_DEFAULT_PAGE_SIZE =
  25;

export const ADMIN_CUSTOMER_MAX_PAGE_SIZE =
  100;

export const ADMIN_CUSTOMER_MAX_SAFE_PAGE =
  Math.floor(
    Number.MAX_SAFE_INTEGER /
    ADMIN_CUSTOMER_MAX_PAGE_SIZE,
  );

export interface AdminCustomerListQuery {
  q: string;
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

export function parseAdminCustomerListQuery(
  searchParams: URLSearchParams,
): AdminCustomerListQuery {
  const q =
    normalizeSearchText(
      searchParams.get('q'),
    );

  const page =
    parsePositiveInteger(
      searchParams.get('page'),
      ADMIN_CUSTOMER_DEFAULT_PAGE,
      ADMIN_CUSTOMER_MAX_SAFE_PAGE,
    );

  const requestedPageSize =
    parsePositiveInteger(
      searchParams.get('pageSize'),
      ADMIN_CUSTOMER_DEFAULT_PAGE_SIZE,
    );

  const pageSize =
    Math.min(
      requestedPageSize,
      ADMIN_CUSTOMER_MAX_PAGE_SIZE,
    );

  return {
    q,
    page,
    pageSize,
  };
}