import {
  relations,
  sql,
} from 'drizzle-orm';

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
|--------------------------------------------------------------------------
| Enums
|--------------------------------------------------------------------------
*/

export const productConditionEnum =
  pgEnum(
    'product_condition',
    [
      'new',
      'used',
      'refurbished',
      'tested',
    ],
  );

export const productCommerceModeEnum =
  pgEnum(
    'product_commerce_mode',
    [
      'direct-purchase',
      'price-inquiry',
      'sourcing-request',
    ],
  );

export const productPriceVisibilityEnum =
  pgEnum(
    'product_price_visibility',
    [
      'visible',
      'hidden',
    ],
  );

export const productStatusEnum =
  pgEnum(
    'product_status',
    [
      'draft',
      'active',
      'archived',
    ],
  );

export const shippingClassEnum =
  pgEnum(
    'shipping_class',
    [
      'standard',
      'fragile',
      'heavy',
      'pickup-only',
      'custom',
    ],
  );

export const shippingMethodEnum =
  pgEnum(
    'shipping_method',
    [
      'tehran-courier',
      'tipax',
      'iran-post',
      'freight',
      'pickup',
    ],
  );

export const orderStatusEnum =
  pgEnum(
    'order_status',
    [
      'pending',
      'awaiting_payment',
      'paid',
      'processing',
      'ready_to_ship',
      'shipped',
      'completed',
      'cancelled',
      'expired',
    ],
  );

export const paymentProviderEnum =
  pgEnum(
    'payment_provider',
    [
      'zarinpal',
    ],
  );

export const paymentEnvironmentEnum =
  pgEnum(
    'payment_environment',
    [
      'sandbox',
      'production',
    ],
  );

export const paymentStatusEnum =
  pgEnum(
    'payment_status',
    [
      'created',
      'pending',
      'paid',
      'failed',
      'cancelled',
    ],
  );

export const inventoryReservationStatusEnum =
  pgEnum(
    'inventory_reservation_status',
    [
      'active',
      'consumed',
      'released',
      'expired',
    ],
  );

export const inventoryMovementTypeEnum =
  pgEnum(
    'inventory_movement_type',
    [
      'initial',
      'adjustment',
      'purchase',
      'sale',
      'return',
      'damage',
      'reservation_release',
    ],
  );

/*
|--------------------------------------------------------------------------
| Products
|--------------------------------------------------------------------------
*/

export const products =
  pgTable(
    'products',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      contentId:
        text('content_id')
          .notNull(),

      sku:
        text('sku'),

      partNumber:
        text('part_number')
          .notNull(),

      name:
        text('name')
          .notNull(),

      brand:
        text('brand')
          .notNull(),

      manufacturer:
        text('manufacturer'),

      condition:
        productConditionEnum(
          'condition',
        )
          .notNull(),

      commerceMode:
        productCommerceModeEnum(
          'commerce_mode',
        )
          .notNull(),

      priceVisibility:
        productPriceVisibilityEnum(
          'price_visibility',
        )
          .notNull(),

      shippingClass:
        shippingClassEnum(
          'shipping_class',
        )
          .default('standard')
          .notNull(),

      status:
        productStatusEnum(
          'status',
        )
          .default('active')
          .notNull(),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        timestamp(
          'updated_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      uniqueIndex(
        'products_content_id_unique',
      ).on(
        table.contentId,
      ),

      uniqueIndex(
        'products_sku_unique',
      )
        .on(
          table.sku,
        )
        .where(
          sql`${table.sku} is not null`,
        ),

      index(
        'products_status_idx',
      ).on(
        table.status,
      ),

      index(
        'products_commerce_mode_idx',
      ).on(
        table.commerceMode,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Product prices
|--------------------------------------------------------------------------
*/

export const productPrices =
  pgTable(
    'product_prices',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      productId:
        uuid('product_id')
          .notNull()
          .references(
            () => products.id,
            {
              onDelete: 'restrict',
            },
          ),

      amountRial:
        bigint(
          'amount_rial',
          {
            mode: 'number',
          },
        )
          .notNull(),

      currency:
        text('currency')
          .default('IRR')
          .notNull(),

      validFrom:
        timestamp(
          'valid_from',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      validTo:
        timestamp(
          'valid_to',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      check(
        'product_prices_amount_nonnegative',
        sql`${table.amountRial} >= 0`,
      ),

      check(
        'product_prices_currency_irr',
        sql`${table.currency} = 'IRR'`,
      ),

      check(
        'product_prices_valid_range',
        sql`
          ${table.validTo} is null
          or
          ${table.validTo} > ${table.validFrom}
        `,
      ),

      uniqueIndex(
        'product_prices_current_unique',
      )
        .on(
          table.productId,
        )
        .where(
          sql`${table.validTo} is null`,
        ),

      index(
        'product_prices_product_history_idx',
      ).on(
        table.productId,
        table.validFrom,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Inventory
|--------------------------------------------------------------------------
*/

export const inventory =
  pgTable(
    'inventory',
    {
      productId:
        uuid('product_id')
          .primaryKey()
          .references(
            () => products.id,
            {
              onDelete: 'restrict',
            },
          ),

      onHand:
        integer('on_hand')
          .default(0)
          .notNull(),

      reserved:
        integer('reserved')
          .default(0)
          .notNull(),

      updatedAt:
        timestamp(
          'updated_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      check(
        'inventory_on_hand_nonnegative',
        sql`${table.onHand} >= 0`,
      ),

      check(
        'inventory_reserved_nonnegative',
        sql`${table.reserved} >= 0`,
      ),

      check(
        'inventory_reserved_not_above_on_hand',
        sql`
          ${table.reserved}
          <=
          ${table.onHand}
        `,
      ),
    ],
  );

export const inventoryMovements =
  pgTable(
    'inventory_movements',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      productId:
        uuid('product_id')
          .notNull()
          .references(
            () => products.id,
            {
              onDelete: 'restrict',
            },
          ),

      type:
        inventoryMovementTypeEnum(
          'type',
        )
          .notNull(),

      quantityDelta:
        integer('quantity_delta')
          .notNull(),

      referenceType:
        text('reference_type'),

      referenceId:
        text('reference_id'),

      note:
        text('note'),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      index(
        'inventory_movements_product_created_idx',
      ).on(
        table.productId,
        table.createdAt,
      ),

      index(
        'inventory_movements_reference_idx',
      ).on(
        table.referenceType,
        table.referenceId,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Orders
|--------------------------------------------------------------------------
*/

export const orders =
  pgTable(
    'orders',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      orderNumber:
        text('order_number')
          .notNull(),

      status:
        orderStatusEnum(
          'status',
        )
          .default('pending')
          .notNull(),

      customerName:
        text('customer_name')
          .notNull(),

      customerPhone:
        text('customer_phone')
          .notNull(),

      customerCity:
        text('customer_city')
          .notNull(),

      customerAddress:
        text('customer_address')
          .notNull(),

      customerNotes:
        text('customer_notes')
          .notNull(),

      shippingMethodId:
        shippingMethodEnum(
          'shipping_method_id',
        )
          .notNull(),

      shippingMethodLabel:
        text(
          'shipping_method_label',
        )
          .notNull(),

      subtotalRial:
        bigint(
          'subtotal_rial',
          {
            mode: 'number',
          },
        )
          .notNull(),

      shippingFeeRial:
        bigint(
          'shipping_fee_rial',
          {
            mode: 'number',
          },
        ),

      totalRial:
        bigint(
          'total_rial',
          {
            mode: 'number',
          },
        ),

      currency:
        text('currency')
          .default('IRR')
          .notNull(),

      paymentReady:
        boolean('payment_ready')
          .default(false)
          .notNull(),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        timestamp(
          'updated_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      paidAt:
        timestamp(
          'paid_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),
    },
    (table) => [
      uniqueIndex(
        'orders_order_number_unique',
      ).on(
        table.orderNumber,
      ),

      check(
        'orders_subtotal_nonnegative',
        sql`${table.subtotalRial} >= 0`,
      ),

      check(
        'orders_shipping_fee_nonnegative',
        sql`
          ${table.shippingFeeRial} is null
          or
          ${table.shippingFeeRial} >= 0
        `,
      ),

      check(
        'orders_total_nonnegative',
        sql`
          ${table.totalRial} is null
          or
          ${table.totalRial} >= 0
        `,
      ),

      check(
        'orders_currency_irr',
        sql`${table.currency} = 'IRR'`,
      ),

      index(
        'orders_status_created_idx',
      ).on(
        table.status,
        table.createdAt,
      ),

      index(
        'orders_customer_phone_idx',
      ).on(
        table.customerPhone,
      ),
    ],
  );

export const orderItems =
  pgTable(
    'order_items',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      orderId:
        uuid('order_id')
          .notNull()
          .references(
            () => orders.id,
            {
              onDelete: 'restrict',
            },
          ),

      productId:
        uuid('product_id')
          .notNull()
          .references(
            () => products.id,
            {
              onDelete: 'restrict',
            },
          ),

      productName:
        text('product_name')
          .notNull(),

      brand:
        text('brand')
          .notNull(),

      partNumber:
        text('part_number')
          .notNull(),

      quantity:
        integer('quantity')
          .notNull(),

      unitPriceRial:
        bigint(
          'unit_price_rial',
          {
            mode: 'number',
          },
        )
          .notNull(),

      lineTotalRial:
        bigint(
          'line_total_rial',
          {
            mode: 'number',
          },
        )
          .notNull(),

      shippingClass:
        shippingClassEnum(
          'shipping_class',
        )
          .notNull(),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      check(
        'order_items_quantity_range',
        sql`
          ${table.quantity} >= 1
          and
          ${table.quantity} <= 999
        `,
      ),

      check(
        'order_items_unit_price_nonnegative',
        sql`${table.unitPriceRial} >= 0`,
      ),

      check(
        'order_items_line_total_nonnegative',
        sql`${table.lineTotalRial} >= 0`,
      ),

      check(
        'order_items_line_total_consistent',
        sql`
          ${table.lineTotalRial}
          =
          ${table.unitPriceRial}
          *
          ${table.quantity}
        `,
      ),

      index(
        'order_items_order_idx',
      ).on(
        table.orderId,
      ),

      index(
        'order_items_product_idx',
      ).on(
        table.productId,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Inventory reservations
|--------------------------------------------------------------------------
*/

export const inventoryReservations =
  pgTable(
    'inventory_reservations',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      productId:
        uuid('product_id')
          .notNull()
          .references(
            () => products.id,
            {
              onDelete: 'restrict',
            },
          ),

      orderId:
        uuid('order_id')
          .notNull()
          .references(
            () => orders.id,
            {
              onDelete: 'restrict',
            },
          ),

      quantity:
        integer('quantity')
          .notNull(),

      status:
        inventoryReservationStatusEnum(
          'status',
        )
          .default('active')
          .notNull(),

      expiresAt:
        timestamp(
          'expires_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .notNull(),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      releasedAt:
        timestamp(
          'released_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),
    },
    (table) => [
      check(
        'inventory_reservations_quantity_range',
        sql`
          ${table.quantity} >= 1
          and
          ${table.quantity} <= 999
        `,
      ),

      uniqueIndex(
        'inventory_reservations_active_product_order_unique',
      )
        .on(
          table.productId,
          table.orderId,
        )
        .where(
          sql`${table.status} = 'active'`,
        ),

      index(
        'inventory_reservations_order_idx',
      ).on(
        table.orderId,
      ),

      index(
        'inventory_reservations_active_expiry_idx',
      ).on(
        table.status,
        table.expiresAt,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Payments
|--------------------------------------------------------------------------
*/

export const payments =
  pgTable(
    'payments',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      orderId:
        uuid('order_id')
          .notNull()
          .references(
            () => orders.id,
            {
              onDelete: 'restrict',
            },
          ),

      provider:
        paymentProviderEnum(
          'provider',
        )
          .notNull(),

      environment:
        paymentEnvironmentEnum(
          'environment',
        )
          .notNull(),

      status:
        paymentStatusEnum(
          'status',
        )
          .default('created')
          .notNull(),

      amountRial:
        bigint(
          'amount_rial',
          {
            mode: 'number',
          },
        )
          .notNull(),

      currency:
        text('currency')
          .default('IRR')
          .notNull(),

      authority:
        text('authority'),

      refId:
        text('ref_id'),

      providerCode:
        integer('provider_code'),

      providerMessage:
        text('provider_message'),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      requestedAt:
        timestamp(
          'requested_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      verifiedAt:
        timestamp(
          'verified_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      failedAt:
        timestamp(
          'failed_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),
    },
    (table) => [
      check(
        'payments_amount_positive',
        sql`${table.amountRial} > 0`,
      ),

      check(
        'payments_currency_irr',
        sql`${table.currency} = 'IRR'`,
      ),

      uniqueIndex(
        'payments_authority_unique',
      )
        .on(
          table.authority,
        )
        .where(
          sql`${table.authority} is not null`,
        ),

      index(
        'payments_order_created_idx',
      ).on(
        table.orderId,
        table.createdAt,
      ),

      index(
        'payments_status_idx',
      ).on(
        table.status,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Order status history
|--------------------------------------------------------------------------
*/

export const orderStatusHistory =
  pgTable(
    'order_status_history',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      orderId:
        uuid('order_id')
          .notNull()
          .references(
            () => orders.id,
            {
              onDelete: 'restrict',
            },
          ),

      fromStatus:
        orderStatusEnum(
          'from_status',
        ),

      toStatus:
        orderStatusEnum(
          'to_status',
        )
          .notNull(),

      reason:
        text('reason'),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),
    },
    (table) => [
      index(
        'order_status_history_order_created_idx',
      ).on(
        table.orderId,
        table.createdAt,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------
| Relations
|--------------------------------------------------------------------------
*/

export const productsRelations =
  relations(
    products,
    ({ one, many }) => ({
      inventory:
        one(
          inventory,
          {
            fields: [
              products.id,
            ],
            references: [
              inventory.productId,
            ],
          },
        ),

      prices:
        many(
          productPrices,
        ),

      inventoryMovements:
        many(
          inventoryMovements,
        ),

      reservations:
        many(
          inventoryReservations,
        ),

      orderItems:
        many(
          orderItems,
        ),
    }),
  );

export const productPricesRelations =
  relations(
    productPrices,
    ({ one }) => ({
      product:
        one(
          products,
          {
            fields: [
              productPrices.productId,
            ],
            references: [
              products.id,
            ],
          },
        ),
    }),
  );

export const inventoryRelations =
  relations(
    inventory,
    ({ one }) => ({
      product:
        one(
          products,
          {
            fields: [
              inventory.productId,
            ],
            references: [
              products.id,
            ],
          },
        ),
    }),
  );

export const inventoryMovementsRelations =
  relations(
    inventoryMovements,
    ({ one }) => ({
      product:
        one(
          products,
          {
            fields: [
              inventoryMovements.productId,
            ],
            references: [
              products.id,
            ],
          },
        ),
    }),
  );

export const ordersRelations =
  relations(
    orders,
    ({ many }) => ({
      items:
        many(
          orderItems,
        ),

      reservations:
        many(
          inventoryReservations,
        ),

      payments:
        many(
          payments,
        ),

      statusHistory:
        many(
          orderStatusHistory,
        ),
    }),
  );

export const orderItemsRelations =
  relations(
    orderItems,
    ({ one }) => ({
      order:
        one(
          orders,
          {
            fields: [
              orderItems.orderId,
            ],
            references: [
              orders.id,
            ],
          },
        ),

      product:
        one(
          products,
          {
            fields: [
              orderItems.productId,
            ],
            references: [
              products.id,
            ],
          },
        ),
    }),
  );

export const inventoryReservationsRelations =
  relations(
    inventoryReservations,
    ({ one }) => ({
      product:
        one(
          products,
          {
            fields: [
              inventoryReservations.productId,
            ],
            references: [
              products.id,
            ],
          },
        ),

      order:
        one(
          orders,
          {
            fields: [
              inventoryReservations.orderId,
            ],
            references: [
              orders.id,
            ],
          },
        ),
    }),
  );

export const paymentsRelations =
  relations(
    payments,
    ({ one }) => ({
      order:
        one(
          orders,
          {
            fields: [
              payments.orderId,
            ],
            references: [
              orders.id,
            ],
          },
        ),
    }),
  );

export const orderStatusHistoryRelations =
  relations(
    orderStatusHistory,
    ({ one }) => ({
      order:
        one(
          orders,
          {
            fields: [
              orderStatusHistory.orderId,
            ],
            references: [
              orders.id,
            ],
          },
        ),
    }),
  );
