export interface AdminProductSnapshotItem {
  id: string;
  contentId: string;
  sku: string | null;
  partNumber: string;
  name: string;
  brand: string;
  manufacturer: string | null;
  condition:
    | "new"
    | "used"
    | "refurbished"
    | "tested";
  commerceMode:
    | "direct-purchase"
    | "price-inquiry"
    | "sourcing-request";
  priceVisibility:
    | "visible"
    | "hidden";
  shippingClass: string;
  status:
    | "draft"
    | "active"
    | "archived";
  currentPriceRial: number | null;
  onHand: number;
  reserved: number;
  available: number;
  createdAt: string;
  updatedAt: string;
}

type RawAdminProductInput =
  AdminProductSnapshotItem &
  Record<string, unknown>;

export function createAdminProductsSnapshot(
  products: RawAdminProductInput[],
): AdminProductSnapshotItem[] {
  return products.map(
    (product) => ({
      id:
        product.id,

      contentId:
        product.contentId,

      sku:
        product.sku,

      partNumber:
        product.partNumber,

      name:
        product.name,

      brand:
        product.brand,

      manufacturer:
        product.manufacturer,

      condition:
        product.condition,

      commerceMode:
        product.commerceMode,

      priceVisibility:
        product.priceVisibility,

      shippingClass:
        product.shippingClass,

      status:
        product.status,

      currentPriceRial:
        product.currentPriceRial,

      onHand:
        product.onHand,

      reserved:
        product.reserved,

      available:
        product.available,

      createdAt:
        product.createdAt,

      updatedAt:
        product.updatedAt,
    }),
  );
}
