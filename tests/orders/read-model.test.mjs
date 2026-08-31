import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_ORDER_DEFAULT_PAGE,
  ADMIN_ORDER_DEFAULT_PAGE_SIZE,
  ADMIN_ORDER_MAX_PAGE_SIZE,
  ADMIN_ORDER_MAX_SAFE_PAGE,
  isAdminOrderId,
  isAdminOrderStatus,
  parseAdminOrderListQuery,
} from '../../src/server/orders/read-model.ts';

test(
  'admin order status validator accepts only canonical database statuses',
  () => {
    for (
      const status of [
        'pending',
        'awaiting_payment',
        'paid',
        'processing',
        'ready_to_ship',
        'shipped',
        'completed',
        'cancelled',
        'expired',
      ]
    ) {
      assert.equal(
        isAdminOrderStatus(status),
        true,
      );
    }

    for (
      const value of [
        '',
        'all',
        'unknown',
        'PAID',
        ' paid ',
      ]
    ) {
      assert.equal(
        isAdminOrderStatus(value),
        false,
      );
    }
  },
);

test(
  'admin order list query uses safe defaults and normalized search input',
  () => {
    const parsed =
      parseAdminOrderListQuery(
        new URLSearchParams({
          q: '   CNC    spindle   ',
          status: 'paid',
        }),
      );

    assert.deepEqual(
      parsed,
      {
        q:
          'CNC spindle',

        status:
          'paid',

        page:
          ADMIN_ORDER_DEFAULT_PAGE,

        pageSize:
          ADMIN_ORDER_DEFAULT_PAGE_SIZE,
      },
    );
  },
);

test(
  'admin order list query rejects invalid pagination and unknown status',
  () => {
    const parsed =
      parseAdminOrderListQuery(
        new URLSearchParams({
          status: 'not-a-status',
          page: '-2',
          pageSize: 'abc',
        }),
      );

    assert.deepEqual(
      parsed,
      {
        q: '',
        status: null,
        page:
          ADMIN_ORDER_DEFAULT_PAGE,
        pageSize:
          ADMIN_ORDER_DEFAULT_PAGE_SIZE,
      },
    );
  },
);

test(
  'admin order list query treats all as no status filter and caps page size',
  () => {
    const parsed =
      parseAdminOrderListQuery(
        new URLSearchParams({
          status: 'all',
          page: '3',
          pageSize: '999',
        }),
      );

    assert.deepEqual(
      parsed,
      {
        q: '',
        status: null,
        page: 3,
        pageSize:
          ADMIN_ORDER_MAX_PAGE_SIZE,
      },
    );
  },
);
test(
  'admin order id validator accepts canonical UUID input and rejects malformed route ids',
  () => {
    assert.equal(
      isAdminOrderId(
        '123e4567-e89b-12d3-a456-426614174000',
      ),
      true,
    );

    assert.equal(
      isAdminOrderId(
        ' 123E4567-E89B-12D3-A456-426614174000 ',
      ),
      true,
    );

    for (
      const value of [
        '',
        'not-a-uuid',
        '123',
        '123e4567-e89b-12d3-a456',
        '../orders',
      ]
    ) {
      assert.equal(
        isAdminOrderId(value),
        false,
      );
    }
  },
);
test(
  'admin order list query rejects page values that could overflow repository offsets',
  () => {
    const accepted =
      parseAdminOrderListQuery(
        new URLSearchParams({
          page:
            String(
              ADMIN_ORDER_MAX_SAFE_PAGE,
            ),
          pageSize:
            String(
              ADMIN_ORDER_MAX_PAGE_SIZE,
            ),
        }),
      );

    assert.equal(
      accepted.page,
      ADMIN_ORDER_MAX_SAFE_PAGE,
    );

    const rejected =
      parseAdminOrderListQuery(
        new URLSearchParams({
          page:
            String(
              ADMIN_ORDER_MAX_SAFE_PAGE +
              1,
            ),
          pageSize:
            String(
              ADMIN_ORDER_MAX_PAGE_SIZE,
            ),
        }),
      );

    assert.equal(
      rejected.page,
      ADMIN_ORDER_DEFAULT_PAGE,
    );
  },
);
