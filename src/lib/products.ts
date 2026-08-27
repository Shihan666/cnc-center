import type { CollectionEntry } from "astro:content";
import { serviceCategories } from "../data/serviceCategories";
import { shopCategories } from "../data/shopCategories";

export type ProductEntry = CollectionEntry<"products">;

export type ProductCondition =
  ProductEntry["data"]["condition"];

export type ProductCommerceMode =
  ProductEntry["data"]["commerceMode"];

export type ProductPriceVisibility =
  ProductEntry["data"]["priceVisibility"];

export const productConditionLabels: Record<
  ProductCondition,
  string
> = {
  new: "نو",
  used: "کارکرده",
  refurbished: "بازسازی‌شده",
  tested: "تست‌شده",
};

export const productCommerceModeLabels: Record<
  ProductCommerceMode,
  string
> = {
  "direct-purchase": "خرید آنلاین",
  "price-inquiry": "استعلام قیمت",
  "sourcing-request": "درخواست تأمین",
};

export const productCommerceModeDescriptions: Record<
  ProductCommerceMode,
  string
> = {
  "direct-purchase":
    "این محصول دارای قیمت قابل نمایش است و مسیر خرید مستقیم برای آن فعال می‌شود.",

  "price-inquiry":
    "قیمت این محصول پس از بررسی موجودی و شرایط روز اعلام می‌شود.",

  "sourcing-request":
    "این قطعه بر اساس Part Number و مشخصات فنی از مسیر تأمین سفارشی بررسی می‌شود.",
};

export function isActiveProduct(
  product: ProductEntry,
): boolean {
  return product.data.status === "active";
}

export function sortProducts(
  products: ProductEntry[],
): ProductEntry[] {
  return [...products].sort((a, b) => {
    if (a.data.featured !== b.data.featured) {
      return Number(b.data.featured) - Number(a.data.featured);
    }

    if (a.data.order !== b.data.order) {
      return a.data.order - b.data.order;
    }

    return a.data.name.localeCompare(
      b.data.name,
      "fa",
    );
  });
}

export function getActiveProducts(
  products: ProductEntry[],
): ProductEntry[] {
  return sortProducts(
    products.filter(isActiveProduct),
  );
}

export function getProductHref(
  product: ProductEntry,
): string {
  return `/products/${product.id}/`;
}

export function getProductCategoryHref(
  product: ProductEntry,
): string {
  return `/shop/${product.data.category}/`;
}

export function getProductCategoryTitle(
  product: ProductEntry,
): string {
  return (
    shopCategories.find(
      (category) =>
        category.slug === product.data.category,
    )?.title ?? product.data.category
  );
}

export function getRelatedServiceTitle(
  serviceId: string,
): string {
  const service = serviceCategories.find(
    (category) => category.id === serviceId,
  );

  return service?.title ?? serviceId;
}

export function getProductConditionLabel(
  product: ProductEntry,
): string {
  return productConditionLabels[
    product.data.condition
  ];
}

export function getProductCommerceModeLabel(
  product: ProductEntry,
): string {
  return productCommerceModeLabels[
    product.data.commerceMode
  ];
}

export function getProductCommerceModeDescription(
  product: ProductEntry,
): string {
  return productCommerceModeDescriptions[
    product.data.commerceMode
  ];
}

export function getVisibleProductPrice(
  product: ProductEntry,
): number | null {
  if (
    product.data.priceVisibility !== "visible" ||
    product.data.price === undefined
  ) {
    return null;
  }

  return product.data.price;
}

export function formatProductPrice(
  product: ProductEntry,
): string | null {
  const price = getVisibleProductPrice(product);

  if (price === null) {
    return null;
  }

  const formattedPrice = new Intl.NumberFormat(
    "fa-IR",
    {
      maximumFractionDigits: 0,
    },
  ).format(price);

  const unit =
    product.data.priceUnit === "rial"
      ? "ریال"
      : "تومان";

  return `${formattedPrice} ${unit}`;
}

export function getProductInventoryLabel(
  product: ProductEntry,
): string {
  if (product.data.stockQuantity > 0) {
    const quantity = new Intl.NumberFormat(
      "fa-IR",
    ).format(product.data.stockQuantity);

    return `موجودی: ${quantity} عدد`;
  }

  if (
    product.data.commerceMode ===
    "sourcing-request"
  ) {
    return "تأمین سفارشی";
  }

  return "ناموجود";
}

export function canPurchaseDirectly(
  product: ProductEntry,
): boolean {
  return (
    product.data.status === "active" &&
    product.data.commerceMode ===
      "direct-purchase" &&
    product.data.priceVisibility === "visible" &&
    product.data.price !== undefined &&
    product.data.stockQuantity > 0
  );
}