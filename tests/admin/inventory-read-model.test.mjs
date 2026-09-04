import assert from 'node:assert/strict';

import {
  test,
} from 'node:test';

import {
  ADMIN_INVENTORY_DEFAULT_PAGE,
  ADMIN_INVENTORY_DEFAULT_PAGE_SIZE,
  ADMIN_INVENTORY_MAX_PAGE_SIZE,
  parseAdminInventoryListQuery,
} from '../../src/server/inventory/read-model.ts';

test(
  'inventory list query uses safe defaults',
  () => {
    const query =
      parseAdminInventoryListQuery(
        new URLSearchParams(),
      );

    assert.deepEqual(
      query,
      {
        q: '',
        inventoryStatus:
          'all',
        page:
          ADMIN_INVENTORY_DEFAULT_PAGE,
        pageSize:
          ADMIN_INVENTORY_DEFAULT_PAGE_SIZE,
      },
    );
  },
);

test(
  'inventory list query normalizes search, status, and pagination',
  () => {
    const query =
      parseAdminInventoryListQuery(
        new URLSearchParams({
          q:
            '  spindle    motor  ',
          inventoryStatus:
            'in-stock',
          page:
            '3',
          pageSize:
            '40',
        }),
      );

    assert.deepEqual(
      query,
      {
        q:
          'spindle motor',
        inventoryStatus:
          'in-stock',
        page:
          3,
        pageSize:
          40,
      },
    );
  },
);

test(
  'inventory list query rejects invalid filters and unsafe pagination',
  () => {
    const invalid =
      parseAdminInventoryListQuery(
        new URLSearchParams({
          inventoryStatus:
            'reserved-only',
          page:
            '0',
          pageSize:
            'not-a-number',
        }),
      );

    assert.equal(
      invalid.inventoryStatus,
      'all',
    );

    assert.equal(
      invalid.page,
      ADMIN_INVENTORY_DEFAULT_PAGE,
    );

    assert.equal(
      invalid.pageSize,
      ADMIN_INVENTORY_DEFAULT_PAGE_SIZE,
    );

    const capped =
      parseAdminInventoryListQuery(
        new URLSearchParams({
          inventoryStatus:
            'out-of-stock',
          page:
            String(
              Number.MAX_SAFE_INTEGER,
            ),
          pageSize:
            '999',
        }),
      );

    assert.equal(
      capped.inventoryStatus,
      'out-of-stock',
    );

    assert.equal(
      capped.page,
      ADMIN_INVENTORY_DEFAULT_PAGE,
    );

    assert.equal(
      capped.pageSize,
      ADMIN_INVENTORY_MAX_PAGE_SIZE,
    );
  },
);
