import type { CollectionEntry } from "astro:content";

export type BrandEntry = CollectionEntry<"brands">;

export function isActiveBrand(brand: BrandEntry): boolean {
  return brand.data.status === "active";
}

export function sortBrands(brands: BrandEntry[]): BrandEntry[] {
  return [...brands].sort((a, b) => {
    if (a.data.featured !== b.data.featured) {
      return Number(b.data.featured) - Number(a.data.featured);
    }

    if (a.data.order !== b.data.order) {
      return a.data.order - b.data.order;
    }

    return a.data.name.localeCompare(b.data.name, "en");
  });
}

export function getActiveBrands(brands: BrandEntry[]): BrandEntry[] {
  return sortBrands(brands.filter(isActiveBrand));
}

export function getFeaturedBrands(brands: BrandEntry[]): BrandEntry[] {
  return getActiveBrands(brands).filter(
    (brand) => brand.data.featured,
  );
}

export function getBrandHref(brand: BrandEntry): string {
  return `/brands/${brand.id}/`;
}