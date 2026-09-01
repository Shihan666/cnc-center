export const ADMIN_PRODUCT_CONDITIONS = [
  'new',
  'used',
  'refurbished',
  'tested',
] as const;

export type AdminProductCondition =
  (typeof ADMIN_PRODUCT_CONDITIONS)[number];

export const ADMIN_PRODUCT_COMMERCE_MODES = [
  'direct-purchase',
  'price-inquiry',
  'sourcing-request',
] as const;

export type AdminProductCommerceMode =
  (typeof ADMIN_PRODUCT_COMMERCE_MODES)[number];

export const ADMIN_PRODUCT_PRICE_VISIBILITIES = [
  'visible',
  'hidden',
] as const;

export type AdminProductPriceVisibility =
  (typeof ADMIN_PRODUCT_PRICE_VISIBILITIES)[number];

export const ADMIN_PRODUCT_SHIPPING_CLASSES = [
  'standard',
  'fragile',
  'heavy',
  'pickup-only',
  'custom',
] as const;

export type AdminProductShippingClass =
  (typeof ADMIN_PRODUCT_SHIPPING_CLASSES)[number];

export const ADMIN_PRODUCT_STATUSES = [
  'draft',
  'active',
  'archived',
] as const;

export type AdminProductStatus =
  (typeof ADMIN_PRODUCT_STATUSES)[number];

export const ADMIN_INVENTORY_MOVEMENT_TYPES = [
  'initial',
  'adjustment',
  'purchase',
  'sale',
  'return',
  'damage',
  'reservation_release',
] as const;

export type AdminInventoryMovementType =
  (typeof ADMIN_INVENTORY_MOVEMENT_TYPES)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_PRODUCT_CONTENT_ID_MAX_LENGTH =
  500;

export const ADMIN_PRODUCT_SKU_MAX_LENGTH =
  200;

export const ADMIN_PRODUCT_PART_NUMBER_MAX_LENGTH =
  500;

export const ADMIN_PRODUCT_NAME_MAX_LENGTH =
  500;

export const ADMIN_PRODUCT_BRAND_MAX_LENGTH =
  500;

export const ADMIN_PRODUCT_MANUFACTURER_MAX_LENGTH =
  500;

export const ADMIN_PRODUCT_INVENTORY_NOTE_MAX_LENGTH =
  500;

export interface CreateAdminProductInput {
  contentId: string;
  sku: string | null;
  partNumber: string;
  name: string;
  brand: string;
  manufacturer: string | null;
  condition: AdminProductCondition;
  commerceMode: AdminProductCommerceMode;
  priceVisibility: AdminProductPriceVisibility;
  shippingClass: AdminProductShippingClass;
  status: AdminProductStatus;
  priceRial: number | null;
}

export interface UpdateAdminProductInput {
  contentId: string;
  sku: string | null;
  partNumber: string;
  name: string;
  brand: string;
  manufacturer: string | null;
  condition: AdminProductCondition;
  commerceMode: AdminProductCommerceMode;
  priceVisibility: AdminProductPriceVisibility;
  shippingClass: AdminProductShippingClass;
  status: AdminProductStatus;
}

export interface SetAdminProductPriceInput {
  amountRial: number;
}

export interface AdjustAdminProductInventoryInput {
  quantityDelta: number;
  note: string | null;
}
export function isAdminProductId(
  value: string,
): boolean {
  return UUID_PATTERN.test(
    value.trim(),
  );
}

function isOneOf<const T extends readonly string[]>(
  values: T,
  value: string,
): value is T[number] {
  return (
    values as readonly string[]
  ).includes(value);
}

export function isAdminProductCondition(
  value: string,
): value is AdminProductCondition {
  return isOneOf(
    ADMIN_PRODUCT_CONDITIONS,
    value,
  );
}

export function isAdminProductCommerceMode(
  value: string,
): value is AdminProductCommerceMode {
  return isOneOf(
    ADMIN_PRODUCT_COMMERCE_MODES,
    value,
  );
}

export function isAdminProductPriceVisibility(
  value: string,
): value is AdminProductPriceVisibility {
  return isOneOf(
    ADMIN_PRODUCT_PRICE_VISIBILITIES,
    value,
  );
}

export function isAdminProductShippingClass(
  value: string,
): value is AdminProductShippingClass {
  return isOneOf(
    ADMIN_PRODUCT_SHIPPING_CLASSES,
    value,
  );
}

export function isAdminProductStatus(
  value: string,
): value is AdminProductStatus {
  return isOneOf(
    ADMIN_PRODUCT_STATUSES,
    value,
  );
}

export function isAdminInventoryMovementType(
  value: string,
): value is AdminInventoryMovementType {
  return isOneOf(
    ADMIN_INVENTORY_MOVEMENT_TYPES,
    value,
  );
}

function isAdminProductTextWithinLimit(
  value: string,
  maxLength: number,
): boolean {
  if (
    !Number.isSafeInteger(maxLength) ||
    maxLength < 1
  ) {
    throw new Error(
      'Product text max length must be a positive safe integer.',
    );
  }

  return (
    value
      .trim()
      .replace(/\s+/g, ' ')
      .length <= maxLength
  );
}

export function normalizeAdminProductText(
  value: string,
  maxLength: number,
): string {
  if (
    !Number.isSafeInteger(maxLength) ||
    maxLength < 1
  ) {
    throw new Error(
      'Product text max length must be a positive safe integer.',
    );
  }

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

export function normalizeAdminOptionalProductText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    normalizeAdminProductText(
      value,
      maxLength,
    );

  return normalized || null;
}

export function isAdminProductPriceRial(
  value: number,
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function isAdminInventoryQuantityDelta(
  value: number,
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value !== 0
  );
}
export function parseCreateAdminProductInput(
  body: Record<string, unknown>,
): CreateAdminProductInput | null {
  const rawContentId =
    body.contentId;
  const rawSku =
    body.sku;
  const rawPartNumber =
    body.partNumber;
  const rawName =
    body.name;
  const rawBrand =
    body.brand;
  const rawManufacturer =
    body.manufacturer;
  const rawCondition =
    body.condition;
  const rawCommerceMode =
    body.commerceMode;
  const rawPriceVisibility =
    body.priceVisibility;
  const rawShippingClass =
    body.shippingClass;
  const rawStatus =
    body.status;
  const rawPriceRial =
    body.priceRial;

  if (
    typeof rawContentId !== 'string' ||
    (
      rawSku !== undefined &&
      rawSku !== null &&
      typeof rawSku !== 'string'
    ) ||
    typeof rawPartNumber !== 'string' ||
    typeof rawName !== 'string' ||
    typeof rawBrand !== 'string' ||
    (
      rawManufacturer !== undefined &&
      rawManufacturer !== null &&
      typeof rawManufacturer !== 'string'
    ) ||
    typeof rawCondition !== 'string' ||
    typeof rawCommerceMode !== 'string' ||
    typeof rawPriceVisibility !== 'string' ||
    typeof rawShippingClass !== 'string' ||
    typeof rawStatus !== 'string' ||
    !isAdminProductTextWithinLimit(
      rawContentId,
      ADMIN_PRODUCT_CONTENT_ID_MAX_LENGTH,
    ) ||
    (
      typeof rawSku === 'string' &&
      !isAdminProductTextWithinLimit(
        rawSku,
        ADMIN_PRODUCT_SKU_MAX_LENGTH,
      )
    ) ||
    !isAdminProductTextWithinLimit(
      rawPartNumber,
      ADMIN_PRODUCT_PART_NUMBER_MAX_LENGTH,
    ) ||
    !isAdminProductTextWithinLimit(
      rawName,
      ADMIN_PRODUCT_NAME_MAX_LENGTH,
    ) ||
    !isAdminProductTextWithinLimit(
      rawBrand,
      ADMIN_PRODUCT_BRAND_MAX_LENGTH,
    ) ||
    (
      typeof rawManufacturer === 'string' &&
      !isAdminProductTextWithinLimit(
        rawManufacturer,
        ADMIN_PRODUCT_MANUFACTURER_MAX_LENGTH,
      )
    ) ||
    (
      rawPriceRial !== undefined &&
      rawPriceRial !== null &&
      typeof rawPriceRial !== 'number'
    )
  ) {
    return null;
  }

  const contentId =
    normalizeAdminProductText(
      rawContentId,
      ADMIN_PRODUCT_CONTENT_ID_MAX_LENGTH,
    );

  const sku =
    normalizeAdminOptionalProductText(
      rawSku,
      ADMIN_PRODUCT_SKU_MAX_LENGTH,
    );

  const partNumber =
    normalizeAdminProductText(
      rawPartNumber,
      ADMIN_PRODUCT_PART_NUMBER_MAX_LENGTH,
    );

  const name =
    normalizeAdminProductText(
      rawName,
      ADMIN_PRODUCT_NAME_MAX_LENGTH,
    );

  const brand =
    normalizeAdminProductText(
      rawBrand,
      ADMIN_PRODUCT_BRAND_MAX_LENGTH,
    );

  const manufacturer =
    normalizeAdminOptionalProductText(
      rawManufacturer,
      ADMIN_PRODUCT_MANUFACTURER_MAX_LENGTH,
    );

  const condition =
    rawCondition.trim();

  const commerceMode =
    rawCommerceMode.trim();

  const priceVisibility =
    rawPriceVisibility.trim();

  const shippingClass =
    rawShippingClass.trim();

  const status =
    rawStatus.trim();

  const priceRial =
    rawPriceRial === undefined ||
    rawPriceRial === null
      ? null
      : rawPriceRial;

  if (
    !contentId ||
    !partNumber ||
    !name ||
    !brand ||
    !isAdminProductCondition(condition) ||
    !isAdminProductCommerceMode(commerceMode) ||
    !isAdminProductPriceVisibility(priceVisibility) ||
    !isAdminProductShippingClass(shippingClass) ||
    !isAdminProductStatus(status) ||
    (
      priceRial !== null &&
      !isAdminProductPriceRial(priceRial)
    )
  ) {
    return null;
  }

  return {
    contentId,
    sku,
    partNumber,
    name,
    brand,
    manufacturer,
    condition,
    commerceMode,
    priceVisibility,
    shippingClass,
    status,
    priceRial,
  };
}
export function parseUpdateAdminProductInput(
  body: Record<string, unknown>,
): UpdateAdminProductInput | null {
  const rawContentId =
    body.contentId;
  const rawSku =
    body.sku;
  const rawPartNumber =
    body.partNumber;
  const rawName =
    body.name;
  const rawBrand =
    body.brand;
  const rawManufacturer =
    body.manufacturer;
  const rawCondition =
    body.condition;
  const rawCommerceMode =
    body.commerceMode;
  const rawPriceVisibility =
    body.priceVisibility;
  const rawShippingClass =
    body.shippingClass;
  const rawStatus =
    body.status;

  if (
    typeof rawContentId !== 'string' ||
    (
      rawSku !== undefined &&
      rawSku !== null &&
      typeof rawSku !== 'string'
    ) ||
    typeof rawPartNumber !== 'string' ||
    typeof rawName !== 'string' ||
    typeof rawBrand !== 'string' ||
    (
      rawManufacturer !== undefined &&
      rawManufacturer !== null &&
      typeof rawManufacturer !== 'string'
    ) ||
    typeof rawCondition !== 'string' ||
    typeof rawCommerceMode !== 'string' ||
    typeof rawPriceVisibility !== 'string' ||
    typeof rawShippingClass !== 'string' ||
    typeof rawStatus !== 'string' ||
    !isAdminProductTextWithinLimit(
      rawContentId,
      ADMIN_PRODUCT_CONTENT_ID_MAX_LENGTH,
    ) ||
    (
      typeof rawSku === 'string' &&
      !isAdminProductTextWithinLimit(
        rawSku,
        ADMIN_PRODUCT_SKU_MAX_LENGTH,
      )
    ) ||
    !isAdminProductTextWithinLimit(
      rawPartNumber,
      ADMIN_PRODUCT_PART_NUMBER_MAX_LENGTH,
    ) ||
    !isAdminProductTextWithinLimit(
      rawName,
      ADMIN_PRODUCT_NAME_MAX_LENGTH,
    ) ||
    !isAdminProductTextWithinLimit(
      rawBrand,
      ADMIN_PRODUCT_BRAND_MAX_LENGTH,
    ) ||
    (
      typeof rawManufacturer === 'string' &&
      !isAdminProductTextWithinLimit(
        rawManufacturer,
        ADMIN_PRODUCT_MANUFACTURER_MAX_LENGTH,
      )
    )
  ) {
    return null;
  }

  const contentId =
    normalizeAdminProductText(
      rawContentId,
      ADMIN_PRODUCT_CONTENT_ID_MAX_LENGTH,
    );

  const sku =
    normalizeAdminOptionalProductText(
      rawSku,
      ADMIN_PRODUCT_SKU_MAX_LENGTH,
    );

  const partNumber =
    normalizeAdminProductText(
      rawPartNumber,
      ADMIN_PRODUCT_PART_NUMBER_MAX_LENGTH,
    );

  const name =
    normalizeAdminProductText(
      rawName,
      ADMIN_PRODUCT_NAME_MAX_LENGTH,
    );

  const brand =
    normalizeAdminProductText(
      rawBrand,
      ADMIN_PRODUCT_BRAND_MAX_LENGTH,
    );

  const manufacturer =
    normalizeAdminOptionalProductText(
      rawManufacturer,
      ADMIN_PRODUCT_MANUFACTURER_MAX_LENGTH,
    );

  const condition =
    rawCondition.trim();

  const commerceMode =
    rawCommerceMode.trim();

  const priceVisibility =
    rawPriceVisibility.trim();

  const shippingClass =
    rawShippingClass.trim();

  const status =
    rawStatus.trim();

  if (
    !contentId ||
    !partNumber ||
    !name ||
    !brand ||
    !isAdminProductCondition(condition) ||
    !isAdminProductCommerceMode(commerceMode) ||
    !isAdminProductPriceVisibility(priceVisibility) ||
    !isAdminProductShippingClass(shippingClass) ||
    !isAdminProductStatus(status)
  ) {
    return null;
  }

  return {
    contentId,
    sku,
    partNumber,
    name,
    brand,
    manufacturer,
    condition,
    commerceMode,
    priceVisibility,
    shippingClass,
    status,
  };
}
export function parseSetAdminProductPriceInput(
  body: Record<string, unknown>,
): SetAdminProductPriceInput | null {
  const rawAmountRial =
    body.amountRial;

  if (
    typeof rawAmountRial !== 'number' ||
    !isAdminProductPriceRial(
      rawAmountRial,
    )
  ) {
    return null;
  }

  return {
    amountRial:
      rawAmountRial,
  };
}

export function parseAdjustAdminProductInventoryInput(
  body: Record<string, unknown>,
): AdjustAdminProductInventoryInput | null {
  const rawQuantityDelta =
    body.quantityDelta;
  const rawNote =
    body.note;

  if (
    typeof rawQuantityDelta !== 'number' ||
    !isAdminInventoryQuantityDelta(
      rawQuantityDelta,
    ) ||
    (
      rawNote !== undefined &&
      rawNote !== null &&
      typeof rawNote !== 'string'
    ) ||
    (
      typeof rawNote === 'string' &&
      !isAdminProductTextWithinLimit(
        rawNote,
        ADMIN_PRODUCT_INVENTORY_NOTE_MAX_LENGTH,
      )
    )
  ) {
    return null;
  }

  const note =
    normalizeAdminOptionalProductText(
      rawNote,
      ADMIN_PRODUCT_INVENTORY_NOTE_MAX_LENGTH,
    );

  return {
    quantityDelta:
      rawQuantityDelta,
    note,
  };
}
export function isAdminProductUniqueViolation(
  error: unknown,
): boolean {
  if (
    typeof error !== 'object' ||
    error === null
  ) {
    return false;
  }

  const candidate =
    error as {
      code?: unknown;
      cause?: unknown;
    };

  if (candidate.code === '23505') {
    return true;
  }

  if (
    typeof candidate.cause === 'object' &&
    candidate.cause !== null
  ) {
    const cause =
      candidate.cause as {
        code?: unknown;
      };

    return cause.code === '23505';
  }

  return false;
}