import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_CUSTOMER_DEFAULT_PAGE,
  ADMIN_CUSTOMER_DEFAULT_PAGE_SIZE,
  ADMIN_CUSTOMER_MAX_PAGE_SIZE,
  parseAdminCustomerListQuery,
} from '../../src/server/customers/read-model.ts';

test(
  'customer list query uses safe defaults',
  () => {
    const query =
      parseAdminCustomerListQuery(
        new URLSearchParams(),
      );

    assert.deepEqual(
      query,
      {
        q: '',
        page:
          ADMIN_CUSTOMER_DEFAULT_PAGE,
        pageSize:
          ADMIN_CUSTOMER_DEFAULT_PAGE_SIZE,
      },
    );
  },
);

test(
  'customer list query normalizes search text and pagination',
  () => {
    const query =
      parseAdminCustomerListQuery(
        new URLSearchParams({
          q:
            '  علی    رضایی  ',
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
          'علی رضایی',
        page:
          3,
        pageSize:
          40,
      },
    );
  },
);

test(
  'customer list query rejects unsafe pagination and caps page size',
  () => {
    const invalid =
      parseAdminCustomerListQuery(
        new URLSearchParams({
          page:
            '0',
          pageSize:
            'not-a-number',
        }),
      );

    assert.equal(
      invalid.page,
      ADMIN_CUSTOMER_DEFAULT_PAGE,
    );

    assert.equal(
      invalid.pageSize,
      ADMIN_CUSTOMER_DEFAULT_PAGE_SIZE,
    );

    const capped =
      parseAdminCustomerListQuery(
        new URLSearchParams({
          page:
            '2',
          pageSize:
            '999',
        }),
      );

    assert.equal(
      capped.page,
      2,
    );

    assert.equal(
      capped.pageSize,
      ADMIN_CUSTOMER_MAX_PAGE_SIZE,
    );
  },
);