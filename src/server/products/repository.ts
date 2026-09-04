import {
  and,
  desc,
  eq,
  isNull,
} from 'drizzle-orm';

import {
  getDatabase,
} from '../db/client.ts';

import {
  inventory,
  inventoryMovements,
  productPrices,
  products,
} from '../db/schema.ts';

import type {
  AdminProductCommerceMode,
  AdminProductCondition,
  AdminProductPriceVisibility,
  AdminProductShippingClass,
  AdjustAdminProductInventoryInput,
  AdminProductStatus,
  CreateAdminProductInput,
  SetAdminProductPriceInput,
  UpdateAdminProductInput,
} from './admin-model.ts';

import {
  isAdminProductId,
} from './admin-model.ts';

import {
  createAdminProductsSnapshot,
  type AdminProductSnapshotItem,
} from './read-model.ts';

export interface AdminProductListItem {
  id: string;
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
  currentPriceRial: number | null;
  onHand: number;
  reserved: number;
  available: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminProductPriceHistoryItem {
  id: string;
  amountRial: number;
  currency: string;
  validFrom: Date;
  validTo: Date | null;
  createdAt: Date;
}

export interface AdminProductInventoryMovementItem {
  id: string;
  type: string;
  quantityDelta: number;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface AdminProductDetail
  extends AdminProductListItem {
  priceHistory:
    AdminProductPriceHistoryItem[];

  inventoryMovements:
    AdminProductInventoryMovementItem[];
}

export async function listAdminProducts():
  Promise<AdminProductListItem[]> {
  const database =
    getDatabase();

  const rows =
    await database
      .select({
        id:
          products.id,

        contentId:
          products.contentId,

        sku:
          products.sku,

        partNumber:
          products.partNumber,

        name:
          products.name,

        brand:
          products.brand,

        manufacturer:
          products.manufacturer,

        condition:
          products.condition,

        commerceMode:
          products.commerceMode,

        priceVisibility:
          products.priceVisibility,

        shippingClass:
          products.shippingClass,

        status:
          products.status,

        currentPriceRial:
          productPrices.amountRial,

        onHand:
          inventory.onHand,

        reserved:
          inventory.reserved,

        createdAt:
          products.createdAt,

        updatedAt:
          products.updatedAt,
      })
      .from(
        products,
      )
      .leftJoin(
        productPrices,
        and(
          eq(
            productPrices.productId,
            products.id,
          ),
          isNull(
            productPrices.validTo,
          ),
        ),
      )
      .leftJoin(
        inventory,
        eq(
          inventory.productId,
          products.id,
        ),
      )
      .orderBy(
        desc(
          products.createdAt,
        ),
        desc(
          products.id,
        ),
      );

  return rows.map(
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
      } as AdminProductListItem;
    },
  );
}

export async function getAdminProductsSnapshot():
  Promise<AdminProductSnapshotItem[]> {
  const products =
    await listAdminProducts();

  return createAdminProductsSnapshot(
    products.map(
      (product) => ({
        ...product,

        createdAt:
          product.createdAt.toISOString(),

        updatedAt:
          product.updatedAt.toISOString(),

      }),
    ),
  );
}

export async function getAdminProductById(
  productId: string,
): Promise<AdminProductDetail | null> {
  const normalizedProductId =
    productId.trim();

  if (
    !isAdminProductId(
      normalizedProductId,
    )
  ) {
    return null;
  }

  const database =
    getDatabase();

  const [
    productRows,
    priceRows,
    movementRows,
  ] =
    await Promise.all([
      database
        .select({
          id:
            products.id,

          contentId:
            products.contentId,

          sku:
            products.sku,

          partNumber:
            products.partNumber,

          name:
            products.name,

          brand:
            products.brand,

          manufacturer:
            products.manufacturer,

          condition:
            products.condition,

          commerceMode:
            products.commerceMode,

          priceVisibility:
            products.priceVisibility,

          shippingClass:
            products.shippingClass,

          status:
            products.status,

          currentPriceRial:
            productPrices.amountRial,

          onHand:
            inventory.onHand,

          reserved:
            inventory.reserved,

          createdAt:
            products.createdAt,

          updatedAt:
            products.updatedAt,
        })
        .from(
          products,
        )
        .leftJoin(
          productPrices,
          and(
            eq(
              productPrices.productId,
              products.id,
            ),
            isNull(
              productPrices.validTo,
            ),
          ),
        )
        .leftJoin(
          inventory,
          eq(
            inventory.productId,
            products.id,
          ),
        )
        .where(
          eq(
            products.id,
            normalizedProductId,
          ),
        )
        .limit(1),

      database
        .select({
          id:
            productPrices.id,

          amountRial:
            productPrices.amountRial,

          currency:
            productPrices.currency,

          validFrom:
            productPrices.validFrom,

          validTo:
            productPrices.validTo,

          createdAt:
            productPrices.createdAt,
        })
        .from(
          productPrices,
        )
        .where(
          eq(
            productPrices.productId,
            normalizedProductId,
          ),
        )
        .orderBy(
          desc(
            productPrices.validFrom,
          ),
          desc(
            productPrices.id,
          ),
        ),

      database
        .select({
          id:
            inventoryMovements.id,

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
        .where(
          eq(
            inventoryMovements.productId,
            normalizedProductId,
          ),
        )
        .orderBy(
          desc(
            inventoryMovements.createdAt,
          ),
          desc(
            inventoryMovements.id,
          ),
        ),
    ]);

  const product =
    productRows[0];

  if (!product) {
    return null;
  }

  const onHand =
    product.onHand ?? 0;

  const reserved =
    product.reserved ?? 0;

  return {
    ...product,

    onHand,
    reserved,

    available:
      onHand - reserved,

    priceHistory:
      priceRows as
        AdminProductPriceHistoryItem[],

    inventoryMovements:
      movementRows as
        AdminProductInventoryMovementItem[],
  } as AdminProductDetail;
}
export async function createAdminProduct(
  input: CreateAdminProductInput,
): Promise<AdminProductDetail> {
  const database =
    getDatabase();

  const productId =
    await database.transaction(
      async (tx) => {
        const productRows =
          await tx
            .insert(
              products,
            )
            .values({
              contentId:
                input.contentId,

              sku:
                input.sku,

              partNumber:
                input.partNumber,

              name:
                input.name,

              brand:
                input.brand,

              manufacturer:
                input.manufacturer,

              condition:
                input.condition,

              commerceMode:
                input.commerceMode,

              priceVisibility:
                input.priceVisibility,

              shippingClass:
                input.shippingClass,

              status:
                input.status,
            })
            .returning({
              id:
                products.id,
            });

        const product =
          productRows[0];

        if (!product) {
          throw new Error(
            'Product creation did not return a product.',
          );
        }

        await tx
          .insert(
            inventory,
          )
          .values({
            productId:
              product.id,

            onHand:
              0,

            reserved:
              0,
          });

        if (input.priceRial !== null) {
          await tx
            .insert(
              productPrices,
            )
            .values({
              productId:
                product.id,

              amountRial:
                input.priceRial,

              currency:
                'IRR',
            });
        }

        return product.id;
      },
    );

  const product =
    await getAdminProductById(
      productId,
    );

  if (!product) {
    throw new Error(
      'Created product could not be loaded.',
    );
  }

  return product;
}
export async function updateAdminProduct(
  productId: string,
  input: UpdateAdminProductInput,
): Promise<AdminProductDetail | null> {
  const normalizedProductId =
    productId.trim();

  if (!isAdminProductId(normalizedProductId)) {
    return null;
  }

  const database =
    getDatabase();

  const updatedRows =
    await database
      .update(
        products,
      )
      .set({
        contentId:
          input.contentId,

        sku:
          input.sku,

        partNumber:
          input.partNumber,

        name:
          input.name,

        brand:
          input.brand,

        manufacturer:
          input.manufacturer,

        condition:
          input.condition,

        commerceMode:
          input.commerceMode,

        priceVisibility:
          input.priceVisibility,

        shippingClass:
          input.shippingClass,

        status:
          input.status,

        updatedAt:
          new Date(),
      })
      .where(
        eq(
          products.id,
          normalizedProductId,
        ),
      )
      .returning({
        id:
          products.id,
      });

  const updatedProduct =
    updatedRows[0];

  if (!updatedProduct) {
    return null;
  }

  return getAdminProductById(
    updatedProduct.id,
  );
}
export async function setAdminProductPrice(
  productId: string,
  input: SetAdminProductPriceInput,
): Promise<AdminProductDetail | null> {
  const normalizedProductId =
    productId.trim();

  if (!isAdminProductId(normalizedProductId)) {
    return null;
  }

  const database =
    getDatabase();

  const changed =
    await database.transaction(
      async (tx) => {
        const productRows =
          await tx
            .select({
              id:
                products.id,
            })
            .from(
              products,
            )
            .where(
              eq(
                products.id,
                normalizedProductId,
              ),
            )
            .for('update')
            .limit(1);

        const product =
          productRows[0];

        if (!product) {
          return false;
        }

        const currentPriceRows =
          await tx
            .select({
              id:
                productPrices.id,

              amountRial:
                productPrices.amountRial,
            })
            .from(
              productPrices,
            )
            .where(
              and(
                eq(
                  productPrices.productId,
                  normalizedProductId,
                ),
                isNull(
                  productPrices.validTo,
                ),
              ),
            )
            .for('update')
            .limit(1);

        const currentPrice =
          currentPriceRows[0];

        if (
          currentPrice &&
          currentPrice.amountRial === input.amountRial
        ) {
          return true;
        }

        const changedAt =
          new Date();

        if (currentPrice) {
          await tx
            .update(
              productPrices,
            )
            .set({
              validTo:
                changedAt,
            })
            .where(
              and(
                eq(
                  productPrices.id,
                  currentPrice.id,
                ),
                isNull(
                  productPrices.validTo,
                ),
              ),
            );
        }

        await tx
          .insert(
            productPrices,
          )
          .values({
            productId:
              normalizedProductId,

            amountRial:
              input.amountRial,

            currency:
              'IRR',

            validFrom:
              changedAt,
          });

        return true;
      },
    );

  if (!changed) {
    return null;
  }

  return getAdminProductById(
    normalizedProductId,
  );
}
export async function adjustAdminProductInventory(
  productId: string,
  input: AdjustAdminProductInventoryInput,
): Promise<AdminProductDetail | null> {
  const normalizedProductId =
    productId.trim();

  if (!isAdminProductId(normalizedProductId)) {
    return null;
  }

  const database =
    getDatabase();

  const changed =
    await database.transaction(
      async (tx) => {
        const inventoryRows =
          await tx
            .select({
              productId:
                inventory.productId,

              onHand:
                inventory.onHand,

              reserved:
                inventory.reserved,
            })
            .from(
              inventory,
            )
            .where(
              eq(
                inventory.productId,
                normalizedProductId,
              ),
            )
            .for('update')
            .limit(1);

        const currentInventory =
          inventoryRows[0];

        if (!currentInventory) {
          return false;
        }

        const nextOnHand =
          currentInventory.onHand +
          input.quantityDelta;

        if (nextOnHand < 0) {
          throw new Error(
            'Inventory adjustment cannot make on-hand quantity negative.',
          );
        }

        if (nextOnHand < currentInventory.reserved) {
          throw new Error(
            'Inventory adjustment cannot reduce on-hand quantity below reserved quantity.',
          );
        }

        const changedAt =
          new Date();

        const updatedRows =
          await tx
            .update(
              inventory,
            )
            .set({
              onHand:
                nextOnHand,

              updatedAt:
                changedAt,
            })
            .where(
              eq(
                inventory.productId,
                normalizedProductId,
              ),
            )
            .returning({
              productId:
                inventory.productId,
            });

        if (!updatedRows[0]) {
          throw new Error(
            'Inventory adjustment lost its locked state.',
          );
        }

        await tx
          .insert(
            inventoryMovements,
          )
          .values({
            productId:
              normalizedProductId,

            type:
              'adjustment',

            quantityDelta:
              input.quantityDelta,

            referenceType:
              'admin',

            note:
              input.note,

            createdAt:
              changedAt,
          });

        return true;
      },
    );

  if (!changed) {
    return null;
  }

  return getAdminProductById(
    normalizedProductId,
  );
}
