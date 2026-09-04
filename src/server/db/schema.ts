import {
  relations,
  sql,
} from 'drizzle-orm';

import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const bytea =
  customType<{
    data: Uint8Array;
    driverData: Uint8Array;
  }>({
    dataType() {
      return 'bytea';
    },
  });

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


export const refundStatusEnum =
  pgEnum(
    'refund_status',
    [
      'requested',
      'processing',
      'completed',
      'failed',
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

export const adminSessionAuthMethodEnum =
  pgEnum(
    'admin_session_auth_method',
    [
      'totp',
      'recovery',
    ],
  );

export const adminLoginChallengeTypeEnum =
  pgEnum(
    'admin_login_challenge_type',
    [
      'enrollment',
      'mfa',
    ],
  );

export const adminAuthThrottleScopeEnum =
  pgEnum(
    'admin_auth_throttle_scope',
    [
      'password_account',
      'password_ip',
      'mfa_account',
      'mfa_ip',
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
| Admin authentication
|--------------------------------------------------------------------------
*/

export const admins =
  pgTable(
    'admins',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      email:
        varchar(
          'email',
          {
            length: 320,
          },
        )
          .notNull(),

      passwordHash:
        text('password_hash')
          .notNull(),

      isActive:
        boolean('is_active')
          .default(true)
          .notNull(),

      passwordChangedAt:
        timestamp(
          'password_changed_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      lastLoginAt:
        timestamp(
          'last_login_at',
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
        'admins_email_unique',
      ).on(
        table.email,
      ),

      check(
        'admins_email_canonical',
        sql`
          ${table.email}
          =
          lower(
            btrim(${table.email})
          )
        `,
      ),

      check(
        'admins_email_nonempty',
        sql`
          char_length(
            btrim(${table.email})
          ) > 0
        `,
      ),

      check(
        'admins_password_hash_nonempty',
        sql`
          char_length(
            ${table.passwordHash}
          ) > 0
        `,
      ),
    ],
  );

export const adminSessions =
  pgTable(
    'admin_sessions',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      adminId:
        uuid('admin_id')
          .notNull()
          .references(
            () => admins.id,
            {
              onDelete: 'restrict',
            },
          ),

      tokenHash:
        varchar(
          'token_hash',
          {
            length: 64,
          },
        )
          .notNull(),

      authMethod:
        adminSessionAuthMethodEnum(
          'auth_method',
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

      lastSeenAt:
        timestamp(
          'last_seen_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      idleExpiresAt:
        timestamp(
          'idle_expires_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .notNull(),

      absoluteExpiresAt:
        timestamp(
          'absolute_expires_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .notNull(),

      revokedAt:
        timestamp(
          'revoked_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      revocationReason:
        varchar(
          'revocation_reason',
          {
            length: 64,
          },
        ),
    },
    (table) => [
      uniqueIndex(
        'admin_sessions_token_hash_unique',
      ).on(
        table.tokenHash,
      ),

      index(
        'admin_sessions_admin_idx',
      ).on(
        table.adminId,
      ),

      index(
        'admin_sessions_active_expiry_idx',
      )
        .on(
          table.idleExpiresAt,
          table.absoluteExpiresAt,
        )
        .where(
          sql`${table.revokedAt} is null`,
        ),

      check(
        'admin_sessions_token_hash_format',
        sql`
          ${table.tokenHash}
          ~
          '^[0-9a-f]{64}$'
        `,
      ),

      check(
        'admin_sessions_idle_after_created',
        sql`
          ${table.idleExpiresAt}
          >
          ${table.createdAt}
        `,
      ),

      check(
        'admin_sessions_absolute_after_created',
        sql`
          ${table.absoluteExpiresAt}
          >
          ${table.createdAt}
        `,
      ),

      check(
        'admin_sessions_idle_not_after_absolute',
        sql`
          ${table.idleExpiresAt}
          <=
          ${table.absoluteExpiresAt}
        `,
      ),

      check(
        'admin_sessions_last_seen_not_before_created',
        sql`
          ${table.lastSeenAt}
          >=
          ${table.createdAt}
        `,
      ),

      check(
        'admin_sessions_revocation_pair',
        sql`
          (
            ${table.revokedAt} is null
            and
            ${table.revocationReason} is null
          )
          or
          (
            ${table.revokedAt} is not null
            and
            ${table.revocationReason} is not null
            and
            char_length(
              btrim(
                ${table.revocationReason}
              )
            ) > 0
          )
        `,
      ),

      check(
        'admin_sessions_revoked_not_before_created',
        sql`
          ${table.revokedAt} is null
          or
          ${table.revokedAt}
          >=
          ${table.createdAt}
        `,
      ),
    ],
  );

export const adminLoginChallenges =
  pgTable(
    'admin_login_challenges',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      adminId:
        uuid('admin_id')
          .notNull()
          .references(
            () => admins.id,
            {
              onDelete: 'restrict',
            },
          ),

      tokenHash:
        varchar(
          'token_hash',
          {
            length: 64,
          },
        )
          .notNull(),

      type:
        adminLoginChallengeTypeEnum(
          'type',
        )
          .notNull(),

      attemptCount:
        smallint('attempt_count')
          .default(0)
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

      consumedAt:
        timestamp(
          'consumed_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      invalidatedAt:
        timestamp(
          'invalidated_at',
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
      uniqueIndex(
        'admin_login_challenges_token_hash_unique',
      ).on(
        table.tokenHash,
      ),

      uniqueIndex(
        'admin_login_challenges_active_admin_unique',
      )
        .on(
          table.adminId,
        )
        .where(
          sql`
            ${table.consumedAt} is null
            and
            ${table.invalidatedAt} is null
          `,
        ),

      index(
        'admin_login_challenges_expires_idx',
      ).on(
        table.expiresAt,
      ),

      check(
        'admin_login_challenges_token_hash_format',
        sql`
          ${table.tokenHash}
          ~
          '^[0-9a-f]{64}$'
        `,
      ),

      check(
        'admin_login_challenges_attempt_range',
        sql`
          ${table.attemptCount} >= 0
          and
          ${table.attemptCount} <= 5
        `,
      ),

      check(
        'admin_login_challenges_expiry_after_created',
        sql`
          ${table.expiresAt}
          >
          ${table.createdAt}
        `,
      ),

      check(
        'admin_login_challenges_terminal_state_exclusive',
        sql`
          not (
            ${table.consumedAt} is not null
            and
            ${table.invalidatedAt} is not null
          )
        `,
      ),

      check(
        'admin_login_challenges_consumed_not_before_created',
        sql`
          ${table.consumedAt} is null
          or
          ${table.consumedAt}
          >=
          ${table.createdAt}
        `,
      ),

      check(
        'admin_login_challenges_invalidated_not_before_created',
        sql`
          ${table.invalidatedAt} is null
          or
          ${table.invalidatedAt}
          >=
          ${table.createdAt}
        `,
      ),
    ],
  );

export const adminTotpFactors =
  pgTable(
    'admin_totp_factors',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      adminId:
        uuid('admin_id')
          .notNull()
          .references(
            () => admins.id,
            {
              onDelete: 'restrict',
            },
          ),

      secretCiphertext:
        bytea(
          'secret_ciphertext',
        )
          .notNull(),

      secretNonce:
        bytea(
          'secret_nonce',
        )
          .notNull(),

      secretAuthTag:
        bytea(
          'secret_auth_tag',
        )
          .notNull(),

      keyVersion:
        smallint('key_version')
          .notNull(),

      lastUsedCounter:
        bigint(
          'last_used_counter',
          {
            mode: 'number',
          },
        ),

      confirmedAt:
        timestamp(
          'confirmed_at',
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
        'admin_totp_factors_admin_unique',
      ).on(
        table.adminId,
      ),

      check(
        'admin_totp_factors_ciphertext_nonempty',
        sql`
          octet_length(
            ${table.secretCiphertext}
          ) > 0
        `,
      ),

      check(
        'admin_totp_factors_nonce_length',
        sql`
          octet_length(
            ${table.secretNonce}
          ) = 12
        `,
      ),

      check(
        'admin_totp_factors_auth_tag_length',
        sql`
          octet_length(
            ${table.secretAuthTag}
          ) = 16
        `,
      ),

      check(
        'admin_totp_factors_key_version_positive',
        sql`${table.keyVersion} >= 1`,
      ),

      check(
        'admin_totp_factors_counter_nonnegative',
        sql`
          ${table.lastUsedCounter} is null
          or
          ${table.lastUsedCounter} >= 0
        `,
      ),

      check(
        'admin_totp_factors_confirmed_not_before_created',
        sql`
          ${table.confirmedAt} is null
          or
          ${table.confirmedAt}
          >=
          ${table.createdAt}
        `,
      ),
    ],
  );

export const adminRecoveryCodes =
  pgTable(
    'admin_recovery_codes',
    {
      id:
        uuid('id')
          .defaultRandom()
          .primaryKey(),

      adminId:
        uuid('admin_id')
          .notNull()
          .references(
            () => admins.id,
            {
              onDelete: 'restrict',
            },
          ),

      codeHash:
        varchar(
          'code_hash',
          {
            length: 64,
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

      usedAt:
        timestamp(
          'used_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      revokedAt:
        timestamp(
          'revoked_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),
    },
    (table) => [
      uniqueIndex(
        'admin_recovery_codes_code_hash_unique',
      ).on(
        table.codeHash,
      ),

      index(
        'admin_recovery_codes_admin_idx',
      ).on(
        table.adminId,
      ),

      index(
        'admin_recovery_codes_active_admin_idx',
      )
        .on(
          table.adminId,
        )
        .where(
          sql`
            ${table.usedAt} is null
            and
            ${table.revokedAt} is null
          `,
        ),

      check(
        'admin_recovery_codes_hash_format',
        sql`
          ${table.codeHash}
          ~
          '^[0-9a-f]{64}$'
        `,
      ),

      check(
        'admin_recovery_codes_terminal_state_exclusive',
        sql`
          not (
            ${table.usedAt} is not null
            and
            ${table.revokedAt} is not null
          )
        `,
      ),

      check(
        'admin_recovery_codes_used_not_before_created',
        sql`
          ${table.usedAt} is null
          or
          ${table.usedAt}
          >=
          ${table.createdAt}
        `,
      ),

      check(
        'admin_recovery_codes_revoked_not_before_created',
        sql`
          ${table.revokedAt} is null
          or
          ${table.revokedAt}
          >=
          ${table.createdAt}
        `,
      ),
    ],
  );

export const adminAuthThrottles =
  pgTable(
    'admin_auth_throttles',
    {
      scope:
        adminAuthThrottleScopeEnum(
          'scope',
        )
          .notNull(),

      keyHash:
        varchar(
          'key_hash',
          {
            length: 64,
          },
        )
          .notNull(),

      failureCount:
        integer('failure_count')
          .default(0)
          .notNull(),

      windowStartedAt:
        timestamp(
          'window_started_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        )
          .defaultNow()
          .notNull(),

      lastFailureAt:
        timestamp(
          'last_failure_at',
          {
            withTimezone: true,
            mode: 'date',
          },
        ),

      blockedUntil:
        timestamp(
          'blocked_until',
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
      primaryKey({
        name:
          'admin_auth_throttles_pkey',
        columns: [
          table.scope,
          table.keyHash,
        ],
      }),

      index(
        'admin_auth_throttles_blocked_idx',
      ).on(
        table.blockedUntil,
      ),

      check(
        'admin_auth_throttles_key_hash_format',
        sql`
          ${table.keyHash}
          ~
          '^[0-9a-f]{64}$'
        `,
      ),

      check(
        'admin_auth_throttles_failure_nonnegative',
        sql`${table.failureCount} >= 0`,
      ),

      check(
        'admin_auth_throttles_last_failure_not_before_window',
        sql`
          ${table.lastFailureAt} is null
          or
          ${table.lastFailureAt}
          >=
          ${table.windowStartedAt}
        `,
      ),
    ],
  );

/*
|--------------------------------------------------------------------------

/* 
| Refunds
*/

export const refunds =
  pgTable(
    'refunds',
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
          ),

      paymentId:
        uuid('payment_id')
          .notNull()
          .references(
            () => payments.id,
          ),

      amountRial:
        bigint(
          'amount_rial',
          {
            mode: 'number',
          },
        )
          .notNull(),

      status:
        refundStatusEnum(
          'status',
        )
          .notNull()
          .default(
            'requested',
          ),

      reason:
        text('reason'),

      provider:
        text('provider'),

      providerRefId:
        text('provider_ref_id'),

      createdAt:
        timestamp(
          'created_at',
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      completedAt:
        timestamp(
          'completed_at',
          {
            withTimezone: true,
          },
        ),
    },
  );


/*
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

export const refundsRelations =
  relations(
    refunds,
    ({
      one,
    }) => ({
      order:
        one(
          orders,
          {
            fields: [
              refunds.orderId,
            ],

            references: [
              orders.id,
            ],
          },
        ),

      payment:
        one(
          payments,
          {
            fields: [
              refunds.paymentId,
            ],

            references: [
              payments.id,
            ],
          },
        ),
    }),
  );


export const adminsRelations =
  relations(
    admins,
    ({ one, many }) => ({
      sessions:
        many(
          adminSessions,
        ),

      loginChallenges:
        many(
          adminLoginChallenges,
        ),

      totpFactor:
        one(
          adminTotpFactors,
        ),

      recoveryCodes:
        many(
          adminRecoveryCodes,
        ),
    }),
  );

export const adminSessionsRelations =
  relations(
    adminSessions,
    ({ one }) => ({
      admin:
        one(
          admins,
          {
            fields: [
              adminSessions.adminId,
            ],
            references: [
              admins.id,
            ],
          },
        ),
    }),
  );

export const adminLoginChallengesRelations =
  relations(
    adminLoginChallenges,
    ({ one }) => ({
      admin:
        one(
          admins,
          {
            fields: [
              adminLoginChallenges.adminId,
            ],
            references: [
              admins.id,
            ],
          },
        ),
    }),
  );

export const adminTotpFactorsRelations =
  relations(
    adminTotpFactors,
    ({ one }) => ({
      admin:
        one(
          admins,
          {
            fields: [
              adminTotpFactors.adminId,
            ],
            references: [
              admins.id,
            ],
          },
        ),
    }),
  );

export const adminRecoveryCodesRelations =
  relations(
    adminRecoveryCodes,
    ({ one }) => ({
      admin:
        one(
          admins,
          {
            fields: [
              adminRecoveryCodes.adminId,
            ],
            references: [
              admins.id,
            ],
          },
        ),
    }),
  );




