import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAdminPagePath,
} from '../../src/server/admin-entry.ts';

test(
  'admin entry path classification matches the locked B8 namespace contract',
  () => {
    const cases = [
      {
        pathname: '/',
        expected: 'non_admin',
      },
      {
        pathname: '/products',
        expected: 'non_admin',
      },
      {
        pathname: '/api/admin/auth/session',
        expected: 'non_admin',
      },
      {
        pathname: '/adminish',
        expected: 'non_admin',
      },
      {
        pathname: '/admin',
        expected: 'protected_admin',
      },
      {
        pathname: '/admin/',
        expected: 'protected_admin',
      },
      {
        pathname: '/admin/orders',
        expected: 'protected_admin',
      },
      {
        pathname: '/admin/auth',
        expected: 'protected_admin',
      },
      {
        pathname: '/admin/auth/',
        expected: 'auth_entry',
      },
      {
        pathname: '/admin/auth/login',
        expected: 'auth_entry',
      },
      {
        pathname: '/admin/auth/totp',
        expected: 'auth_entry',
      },
      {
        pathname: '/admin/auth/recovery',
        expected: 'auth_entry',
      },
      {
        pathname: '/admin/authentication',
        expected: 'protected_admin',
      },
    ];

    for (
      const {
        pathname,
        expected,
      } of cases
    ) {
      assert.equal(
        classifyAdminPagePath(
          pathname,
        ),
        expected,
        pathname,
      );
    }
  },
);
