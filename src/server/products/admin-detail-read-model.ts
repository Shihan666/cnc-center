import {
  getAdminProductById,
} from "./repository.ts";

export interface AdminProductDetailSnapshot {
  id: string;

  name: string;
  partNumber: string;

  brand: string;
  manufacturer: string | null;

  currentPriceRial: number | null;

  onHand: number;
  reserved: number;
  available: number;

  status: string;

  createdAt: string;
  updatedAt: string;
}

export async function getAdminProductDetailSnapshot(
  productId: string,
): Promise<AdminProductDetailSnapshot | null> {
  const product =
    await getAdminProductById(
      productId,
    );

  if (!product) {
    return null;
  }

  return {
    id:
      product.id,

    name:
      product.name,

    partNumber:
      product.partNumber,

    brand:
      product.brand,

    manufacturer:
      product.manufacturer,

    currentPriceRial:
      product.currentPriceRial,

    onHand:
      product.onHand,

    reserved:
      product.reserved,

    available:
      product.available,

    status:
      product.status,

    createdAt:
      product.createdAt.toISOString(),

    updatedAt:
      product.updatedAt.toISOString(),
  };
}
