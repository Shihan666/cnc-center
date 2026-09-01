import assert from 'node:assert/strict';
import {
  after,
  test,
} from 'node:test';

import postgres from 'postgres';

process.loadEnvFile(
  '.env.local',
);

const testDatabaseUrl =
  process.env
    .TEST_DATABASE_URL
    ?.trim();

const originalDatabaseUrl =
  process.env
    .DATABASE_URL
    ?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for product privilege tests.',
  );
}

if (
  originalDatabaseUrl &&
  originalDatabaseUrl ===
    testDatabaseUrl
) {
  throw new Error(
    'TEST_DATABASE_URL must not equal DATABASE_URL.',
  );
}

const sql =
  postgres(
    testDatabaseUrl,
    {
      max: 1,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

after(
  async () => {
    await sql.end();
  },
);

test(
  'product administration runtime privileges remain least-privileged',
  async () => {
    const [
      databaseRow,
    ] =
      await sql`
        select
          current_database()
            as database_name,
          current_user
            as role
      `;

    assert.equal(
      databaseRow.database_name,
      EXPECTED_TEST_DATABASE,
    );

    assert.equal(
      databaseRow.role,
      'cnc_center_app',
    );

    const [
      privilegeRow,
    ] =
      await sql`
        select
          has_table_privilege(
            current_user,
            'products',
            'SELECT'
          ) as products_select,
          has_table_privilege(
            current_user,
            'products',
            'INSERT'
          ) as products_insert,
          has_table_privilege(
            current_user,
            'products',
            'UPDATE'
          ) as products_update,
          has_table_privilege(
            current_user,
            'products',
            'DELETE'
          ) as products_delete,

          has_table_privilege(
            current_user,
            'product_prices',
            'SELECT'
          ) as prices_select,
          has_table_privilege(
            current_user,
            'product_prices',
            'INSERT'
          ) as prices_insert,
          has_table_privilege(
            current_user,
            'product_prices',
            'UPDATE'
          ) as prices_update,
          has_table_privilege(
            current_user,
            'product_prices',
            'DELETE'
          ) as prices_delete,

          has_table_privilege(
            current_user,
            'inventory',
            'SELECT'
          ) as inventory_select,
          has_table_privilege(
            current_user,
            'inventory',
            'INSERT'
          ) as inventory_insert,
          has_table_privilege(
            current_user,
            'inventory',
            'UPDATE'
          ) as inventory_update,
          has_table_privilege(
            current_user,
            'inventory',
            'DELETE'
          ) as inventory_delete,

          has_table_privilege(
            current_user,
            'inventory_movements',
            'SELECT'
          ) as movements_select,
          has_table_privilege(
            current_user,
            'inventory_movements',
            'INSERT'
          ) as movements_insert,
          has_table_privilege(
            current_user,
            'inventory_movements',
            'UPDATE'
          ) as movements_update,
          has_table_privilege(
            current_user,
            'inventory_movements',
            'DELETE'
          ) as movements_delete
      `;

    assert.deepEqual(
      privilegeRow,
      {
        products_select: true,
        products_insert: true,
        products_update: true,
        products_delete: false,

        prices_select: true,
        prices_insert: true,
        prices_update: true,
        prices_delete: false,

        inventory_select: true,
        inventory_insert: true,
        inventory_update: true,
        inventory_delete: false,

        movements_select: true,
        movements_insert: true,
        movements_update: false,
        movements_delete: false,
      },
    );
  },
);