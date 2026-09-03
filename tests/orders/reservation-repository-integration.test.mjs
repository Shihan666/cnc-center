import assert from 'node:assert/strict';

import {
  after,
  afterEach,
  before,
  test,
} from 'node:test';

import {
  randomUUID,
} from 'node:crypto';

import postgres from 'postgres';

process.loadEnvFile(
  '.env.local',
);

const testDatabaseUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

const testMigrationUrl =
  process.env
    .TEST_DATABASE_MIGRATION_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for reservation lifecycle integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for reservation lifecycle integration tests.',
  );
}

const originalDatabaseUrl =
  process.env.DATABASE_URL;

if (
  originalDatabaseUrl?.trim() ===
  testDatabaseUrl
) {
  throw new Error(
    'TEST_DATABASE_URL must not equal DATABASE_URL.',
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

const [
  {
    closeDatabase,
  },
  {
    adjustAdminProductInventory,
    createAdminProduct,
  },
  {
    createPublicPendingOrder,
  },
  {
    consumePaidOrderReservations,
    expireDueOrderReservations,
    releaseCancelledOrderReservations,
  },
] =
  await Promise.all([
    import(
      '../../src/server/db/client.ts'
    ),

    import(
      '../../src/server/products/repository.ts'
    ),

    import(
      '../../src/server/orders/public-repository.ts'
    ),

    import(
      '../../src/server/orders/reservation-repository.ts'
    ),
  ]);

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max: 4,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const ownedOrderIds =
  new Set();

const ownedProductIds =
  new Set();

async function assertTestDatabase() {
  const [row] =
    await migrationSql`
      select
        current_database()
          as database_name
    `;

  assert.equal(
    row.database_name,
    EXPECTED_TEST_DATABASE,
  );
}

async function cleanupOwnedRows() {
  for (
    const orderId of
    ownedOrderIds
  ) {
    await migrationSql`
      delete
      from payments
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from order_status_history
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from inventory_reservations
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from order_items
      where order_id =
        ${orderId}
    `;

    await migrationSql`
      delete
      from orders
      where id =
        ${orderId}
    `;
  }

  ownedOrderIds.clear();

  for (
    const productId of
    ownedProductIds
  ) {
    await migrationSql`
      delete
      from inventory_movements
      where product_id =
        ${productId}
    `;

    await migrationSql`
      delete
      from product_prices
      where product_id =
        ${productId}
    `;

    await migrationSql`
      delete
      from inventory
      where product_id =
        ${productId}
    `;

    await migrationSql`
      delete
      from products
      where id =
        ${productId}
    `;
  }

  ownedProductIds.clear();
}

function createProductInput() {
  const suffix =
    randomUUID();

  return {
    contentId:
      `b14-reservation-${suffix}`,

    sku:
      `B14-RES-SKU-${suffix}`,

    partNumber:
      `B14-RES-PART-${suffix}`,

    name:
      'B14 Reservation Product',

    brand:
      'B14 Test Brand',

    manufacturer:
      null,

    condition:
      'new',

    commerceMode:
      'direct-purchase',

    priceVisibility:
      'visible',

    shippingClass:
      'standard',

    status:
      'active',

    priceRial:
      2_000_000,
  };
}

async function createProductWithStock(
  quantity =
    5,
) {
  const product =
    await createAdminProduct(
      createProductInput(),
    );

  ownedProductIds.add(
    product.id,
  );

  await adjustAdminProductInventory(
    product.id,
    {
      quantityDelta:
        quantity,

      note:
        'B14 reservation lifecycle stock',
    },
  );

  return {
    ...product,

    onHand:
      quantity,

    reserved:
      0,
  };
}

function createPreparedOrder(
  product,
  quantity =
    1,
) {
  const unitPriceRial =
    product.currentPriceRial;

  assert.equal(
    typeof unitPriceRial,
    'number',
  );

  const lineTotalRial =
    unitPriceRial *
    quantity;

  return {
    customer: {
      name:
        'مشتری تست B14',

      phone:
        '09121234567',

      city:
        'تهران',

      address:
        '',

      notes:
        '',
    },

    lines: [
      {
        productId:
          product.id,

        name:
          product.name,

        brand:
          product.brand,

        partNumber:
          product.partNumber,

        quantity,

        unitPriceRial,

        lineTotalRial,

        shippingClass:
          product.shippingClass,
      },
    ],

    shippingMethodId:
      'pickup',

    shippingMethodLabel:
      'تحویل حضوری',

    subtotalRial:
      lineTotalRial,

    shippingFeeRial:
      0,

    totalRial:
      lineTotalRial,

    currency:
      'IRR',

    paymentReady:
      true,
  };
}

async function createReservedOrder({
  quantity =
    1,
  createdAt,
  expiresAt,
} = {}) {
  const product =
    await createProductWithStock(
      5,
    );

  const result =
    await createPublicPendingOrder({
      order:
        createPreparedOrder(
          product,
          quantity,
        ),

      createdAt,

      reservationExpiresAt:
        expiresAt,
    });

  assert.equal(
    result.status,
    'created',
  );

  ownedOrderIds.add(
    result.orderId,
  );

  return {
    product,
    orderId:
      result.orderId,
  };
}

before(
  async () => {
    await assertTestDatabase();
  },
);

afterEach(
  async () => {
    await cleanupOwnedRows();
  },
);

after(
  async () => {
    try {
      await cleanupOwnedRows();

      await closeDatabase();

      await migrationSql.end({
        timeout: 5,
      });
    } finally {
      if (
        originalDatabaseUrl ===
        undefined
      ) {
        delete process.env
          .DATABASE_URL;
      } else {
        process.env.DATABASE_URL =
          originalDatabaseUrl;
      }
    }
  },
);

test(
  'expired active reservations release reserved inventory and expire the pending order atomically',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T08:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const expiredAt =
      new Date(
        expiresAt.getTime() +
        60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          2,

        createdAt,
        expiresAt,
      });

    const [beforeReservation] =
      await migrationSql`
        select id
        from inventory_reservations
        where order_id =
          ${orderId}
          and status =
            ${'active'}
      `;

    assert.ok(
      beforeReservation,
    );

    const result =
      await expireDueOrderReservations({
        expiredAt,
        limit:
          25,
      });

    assert.deepEqual(
      result,
      {
        ordersExpired:
          1,

        reservationsExpired:
          1,

        unitsReleased:
          2,
      },
    );

    const [orderRow] =
      await migrationSql`
        select status
        from orders
        where id =
          ${orderId}
      `;

    assert.equal(
      orderRow.status,
      'expired',
    );

    const [reservationRow] =
      await migrationSql`
        select
          status,
          released_at
        from inventory_reservations
        where id =
          ${beforeReservation.id}
      `;

    assert.equal(
      reservationRow.status,
      'expired',
    );

    assert.equal(
      reservationRow.released_at
        .getTime(),
      expiredAt.getTime(),
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      5,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );

    const historyRows =
      await migrationSql`
        select
          from_status,
          to_status,
          reason
        from order_status_history
        where order_id =
          ${orderId}
          and reason =
            ${'inventory_reservation_expired'}
      `;

    assert.equal(
      historyRows.length,
      1,
    );

    assert.equal(
      historyRows[0]
        .from_status,
      'pending',
    );

    assert.equal(
      historyRows[0]
        .to_status,
      'expired',
    );

    const movementRows =
      await migrationSql`
        select
          type,
          quantity_delta,
          reference_type,
          reference_id
        from inventory_movements
        where product_id =
          ${product.id}
          and type =
            ${'reservation_release'}
      `;

    assert.equal(
      movementRows.length,
      1,
    );

    assert.equal(
      movementRows[0].quantity_delta,
      0,
    );

    assert.equal(
      movementRows[0].reference_type,
      'inventory_reservation',
    );

    assert.equal(
      movementRows[0].reference_id,
      beforeReservation.id,
    );
  },
);

test(
  'reservation expiry leaves future reservations unchanged',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T09:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          1,

        createdAt,
        expiresAt,
      });

    const result =
      await expireDueOrderReservations({
        expiredAt:
          new Date(
            expiresAt.getTime() -
            60 * 1000,
          ),
      });

    assert.deepEqual(
      result,
      {
        ordersExpired:
          0,

        reservationsExpired:
          0,

        unitsReleased:
          0,
      },
    );

    const [orderRow] =
      await migrationSql`
        select status
        from orders
        where id =
          ${orderId}
      `;

    assert.equal(
      orderRow.status,
      'pending',
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'active',
    );

    const [inventoryRow] =
      await migrationSql`
        select reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.reserved,
      1,
    );
  },
);

test(
  'reservation expiry never releases a due reservation after the order is paid',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T10:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          1,

        createdAt,
        expiresAt,
      });

    await migrationSql`
      update orders
      set status =
        ${'paid'}
      where id =
        ${orderId}
    `;

    const result =
      await expireDueOrderReservations({
        expiredAt:
          new Date(
            expiresAt.getTime() +
            60 * 1000,
          ),
      });

    assert.deepEqual(
      result,
      {
        ordersExpired:
          0,

        reservationsExpired:
          0,

        unitsReleased:
          0,
      },
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'active',
    );

    const [inventoryRow] =
      await migrationSql`
        select reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.reserved,
      1,
    );
  },
);

test(
  'concurrent expiry sweeps cannot release the same reservation twice',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T11:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const expiredAt =
      new Date(
        expiresAt.getTime() +
        60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          2,

        createdAt,
        expiresAt,
      });

    const results =
      await Promise.all([
        expireDueOrderReservations({
          expiredAt,
        }),

        expireDueOrderReservations({
          expiredAt,
        }),
      ]);

    assert.equal(
      results.reduce(
        (
          total,
          result,
        ) =>
          total +
          result.ordersExpired,
        0,
      ),
      1,
    );

    assert.equal(
      results.reduce(
        (
          total,
          result,
        ) =>
          total +
          result.unitsReleased,
        0,
      ),
      2,
    );

    const [inventoryRow] =
      await migrationSql`
        select reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.reserved,
      0,
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'expired',
    );

    const [movementCount] =
      await migrationSql`
        select
          count(*)::int
            as count
        from inventory_movements
        where product_id =
          ${product.id}
          and type =
            ${'reservation_release'}
      `;

    assert.equal(
      movementCount.count,
      1,
    );
  },
);
test(
  'paid order consumption atomically consumes reservations and reduces on-hand and reserved inventory',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T12:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const consumedAt =
      new Date(
        createdAt.getTime() +
        5 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          2,

        createdAt,
        expiresAt,
      });

    await migrationSql`
      update orders
      set
        status =
          ${'paid'},
        paid_at =
          ${consumedAt}
      where id =
        ${orderId}
    `;

    const result =
      await consumePaidOrderReservations({
        orderId,
        consumedAt,
      });

    assert.deepEqual(
      result,
      {
        status:
          'consumed',

        reservationsConsumed:
          1,

        unitsConsumed:
          2,
      },
    );

    const [orderRow] =
      await migrationSql`
        select status
        from orders
        where id =
          ${orderId}
      `;

    assert.equal(
      orderRow.status,
      'paid',
    );

    const [reservationRow] =
      await migrationSql`
        select
          status,
          released_at
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'consumed',
    );

    assert.equal(
      reservationRow.released_at,
      null,
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      3,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );

    const movementRows =
      await migrationSql`
        select
          type,
          quantity_delta,
          reference_type,
          reference_id
        from inventory_movements
        where product_id =
          ${product.id}
          and type =
            ${'sale'}
      `;

    assert.equal(
      movementRows.length,
      1,
    );

    assert.equal(
      movementRows[0]
        .quantity_delta,
      -2,
    );

    assert.equal(
      movementRows[0]
        .reference_type,
      'inventory_reservation',
    );

    assert.equal(
      typeof movementRows[0]
        .reference_id,
      'string',
    );
  },
);

test(
  'paid order consumption refuses to consume an unpaid active reservation',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T13:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          1,

        createdAt,
        expiresAt,
      });

    const result =
      await consumePaidOrderReservations({
        orderId,

        consumedAt:
          new Date(
            createdAt.getTime() +
            5 * 60 * 1000,
          ),
      });

    assert.deepEqual(
      result,
      {
        status:
          'not_paid',
      },
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'active',
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      5,
    );

    assert.equal(
      inventoryRow.reserved,
      1,
    );
  },
);

test(
  'concurrent paid order consumption cannot consume the same reservation twice',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T14:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const consumedAt =
      new Date(
        createdAt.getTime() +
        5 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          2,

        createdAt,
        expiresAt,
      });

    await migrationSql`
      update orders
      set
        status =
          ${'paid'},
        paid_at =
          ${consumedAt}
      where id =
        ${orderId}
    `;

    const results =
      await Promise.all([
        consumePaidOrderReservations({
          orderId,
          consumedAt,
        }),

        consumePaidOrderReservations({
          orderId,
          consumedAt,
        }),
      ]);

    assert.equal(
      results.filter(
        (
          result,
        ) =>
          result.status ===
          'consumed',
      ).length,
      1,
    );

    assert.equal(
      results.filter(
        (
          result,
        ) =>
          result.status ===
          'already_settled',
      ).length,
      1,
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      3,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'consumed',
    );

    const [movementCount] =
      await migrationSql`
        select
          count(*)::int
            as count
        from inventory_movements
        where product_id =
          ${product.id}
          and type =
            ${'sale'}
      `;

    assert.equal(
      movementCount.count,
      1,
    );
  },
);
test(
  'cancelled order release atomically releases active reservations without reducing on-hand inventory',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T15:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const releasedAt =
      new Date(
        createdAt.getTime() +
        5 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          2,

        createdAt,
        expiresAt,
      });

    await migrationSql`
      update orders
      set
        status =
          ${'cancelled'},
        updated_at =
          ${releasedAt}
      where id =
        ${orderId}
    `;

    const [reservationBefore] =
      await migrationSql`
        select id
        from inventory_reservations
        where order_id =
          ${orderId}
          and status =
            ${'active'}
      `;

    assert.ok(
      reservationBefore,
    );

    const result =
      await releaseCancelledOrderReservations({
        orderId,
        releasedAt,
      });

    assert.deepEqual(
      result,
      {
        status:
          'released',

        reservationsReleased:
          1,

        unitsReleased:
          2,
      },
    );

    const [orderRow] =
      await migrationSql`
        select status
        from orders
        where id =
          ${orderId}
      `;

    assert.equal(
      orderRow.status,
      'cancelled',
    );

    const [reservationRow] =
      await migrationSql`
        select
          status,
          released_at
        from inventory_reservations
        where id =
          ${reservationBefore.id}
      `;

    assert.equal(
      reservationRow.status,
      'released',
    );

    assert.equal(
      reservationRow.released_at
        .getTime(),
      releasedAt.getTime(),
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      5,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );

    const movementRows =
      await migrationSql`
        select
          type,
          quantity_delta,
          reference_type,
          reference_id
        from inventory_movements
        where product_id =
          ${product.id}
          and type =
            ${'reservation_release'}
      `;

    assert.equal(
      movementRows.length,
      1,
    );

    assert.equal(
      movementRows[0]
        .quantity_delta,
      0,
    );

    assert.equal(
      movementRows[0]
        .reference_type,
      'inventory_reservation',
    );

    assert.equal(
      movementRows[0]
        .reference_id,
      reservationBefore.id,
    );
  },
);

test(
  'cancelled order release refuses to release a pending reservation',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T16:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          1,

        createdAt,
        expiresAt,
      });

    const result =
      await releaseCancelledOrderReservations({
        orderId,

        releasedAt:
          new Date(
            createdAt.getTime() +
            5 * 60 * 1000,
          ),
      });

    assert.deepEqual(
      result,
      {
        status:
          'not_cancelled',
      },
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'active',
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      5,
    );

    assert.equal(
      inventoryRow.reserved,
      1,
    );
  },
);

test(
  'concurrent cancelled order release cannot release the same reservation twice',
  async () => {
    const createdAt =
      new Date(
        '2026-09-03T17:00:00.000Z',
      );

    const expiresAt =
      new Date(
        createdAt.getTime() +
        30 * 60 * 1000,
      );

    const releasedAt =
      new Date(
        createdAt.getTime() +
        5 * 60 * 1000,
      );

    const {
      product,
      orderId,
    } =
      await createReservedOrder({
        quantity:
          2,

        createdAt,
        expiresAt,
      });

    await migrationSql`
      update orders
      set
        status =
          ${'cancelled'},
        updated_at =
          ${releasedAt}
      where id =
        ${orderId}
    `;

    const results =
      await Promise.all([
        releaseCancelledOrderReservations({
          orderId,
          releasedAt,
        }),

        releaseCancelledOrderReservations({
          orderId,
          releasedAt,
        }),
      ]);

    assert.equal(
      results.filter(
        (
          result,
        ) =>
          result.status ===
          'released',
      ).length,
      1,
    );

    assert.equal(
      results.filter(
        (
          result,
        ) =>
          result.status ===
          'already_settled',
      ).length,
      1,
    );

    const [inventoryRow] =
      await migrationSql`
        select
          on_hand,
          reserved
        from inventory
        where product_id =
          ${product.id}
      `;

    assert.equal(
      inventoryRow.on_hand,
      5,
    );

    assert.equal(
      inventoryRow.reserved,
      0,
    );

    const [reservationRow] =
      await migrationSql`
        select status
        from inventory_reservations
        where order_id =
          ${orderId}
      `;

    assert.equal(
      reservationRow.status,
      'released',
    );

    const [movementCount] =
      await migrationSql`
        select
          count(*)::int
            as count
        from inventory_movements
        where product_id =
          ${product.id}
          and type =
            ${'reservation_release'}
      `;

    assert.equal(
      movementCount.count,
      1,
    );
  },
);