import assert from 'node:assert/strict';
import {
  createHash,
  randomUUID,
} from 'node:crypto';
import {
  existsSync,
} from 'node:fs';
import process from 'node:process';
import {
  after,
  before,
  beforeEach,
  test,
} from 'node:test';

import postgres from 'postgres';

if (
  existsSync(
    '.env.local',
  )
) {
  process.loadEnvFile(
    '.env.local',
  );
}

const testRuntimeUrl =
  process.env.TEST_DATABASE_URL;

const testMigrationUrl =
  process.env.TEST_DATABASE_MIGRATION_URL;

if (!testRuntimeUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required.',
  );
}

/*
 * The production DB client intentionally reads DATABASE_URL.
 * Tests explicitly redirect that runtime entrypoint to the
 * isolated TEST database before importing persistence modules.
 */
process.env.DATABASE_URL =
  testRuntimeUrl;

const {
  getAdminByCanonicalEmail,
  runAuthTransaction,
  updateAdminPasswordHashIfCurrent,
} =
  await import(
    '../../src/server/auth/persistence.ts'
  );

const {
  closeDatabase,
} =
  await import(
    '../../src/server/db/client.ts'
  );

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max: 4,
    },
  );

async function cleanAuthTables() {
  /*
   * Fixture cleanup deliberately uses the TEST migration role.
   * Runtime auth persistence never receives DELETE/TRUNCATE.
   */
  await migrationSql`
    delete from admin_recovery_codes
  `;

  await migrationSql`
    delete from admin_totp_factors
  `;

  await migrationSql`
    delete from admin_login_challenges
  `;

  await migrationSql`
    delete from admin_sessions
  `;

  await migrationSql`
    delete from admin_auth_throttles
  `;

  await migrationSql`
    delete from admins
  `;
}

async function insertAdmin(
  {
    email =
      `admin-${randomUUID()}@example.test`,
    passwordHash =
      '$argon2id$test-fixture-hash',
    isActive = true,
    passwordChangedAt =
      new Date(
        '2026-08-29T12:00:00.000Z',
      ),
    lastLoginAt = null,
    updatedAt =
      new Date(
        '2026-08-29T12:00:00.000Z',
      ),
  } = {},
) {
  const rows =
    await migrationSql`
      insert into admins (
        email,
        password_hash,
        is_active,
        password_changed_at,
        last_login_at,
        created_at,
        updated_at
      )
      values (
        ${email},
        ${passwordHash},
        ${isActive},
        ${passwordChangedAt},
        ${lastLoginAt},
        ${passwordChangedAt},
        ${updatedAt}
      )
      returning
        id,
        email,
        password_hash,
        is_active,
        password_changed_at,
        last_login_at,
        updated_at
    `;

  assert.equal(
    rows.length,
    1,
  );

  return rows[0];
}

function recoveryHash(
  index,
) {
  return createHash(
    'sha256',
  )
    .update(
      `c3a2-recovery-${index}`,
      'utf8',
    )
    .digest(
      'hex',
    );
}

function recoveryInputs(
  adminId,
  createdAt =
    new Date(
      '2026-08-29T13:00:00.000Z',
    ),
) {
  return Array.from(
    {
      length: 10,
    },
    (_, index) => ({
      adminId,
      codeHash:
        recoveryHash(
          index,
        ),
      createdAt,
    }),
  );
}

function totpInput(
  adminId,
  {
    createdAt =
      new Date(
        '2026-08-29T13:00:00.000Z',
      ),
    updatedAt =
      new Date(
        '2026-08-29T13:00:00.000Z',
      ),
  } = {},
) {
  return {
    adminId,

    secretCiphertext:
      new Uint8Array([
        11,
        22,
        33,
        44,
        55,
      ]),

    secretNonce:
      new Uint8Array([
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
      ]),

    secretAuthTag:
      new Uint8Array([
        16,
        15,
        14,
        13,
        12,
        11,
        10,
        9,
        8,
        7,
        6,
        5,
        4,
        3,
        2,
        1,
      ]),

    keyVersion: 1,
    createdAt,
    updatedAt,
  };
}

before(
  async () => {
    const databaseRows =
      await migrationSql`
        select current_database() as name
      `;

    assert.equal(
      databaseRows.length,
      1,
    );

    assert.equal(
      databaseRows[0].name,
      'cnc_center_test',
      'Migration fixture connection must target cnc_center_test.',
    );

    const runtimeCheck =
      postgres(
        testRuntimeUrl,
        {
          max: 1,
        },
      );

    try {
      const runtimeRows =
        await runtimeCheck`
          select current_database() as name
        `;

      assert.equal(
        runtimeRows.length,
        1,
      );

      assert.equal(
        runtimeRows[0].name,
        'cnc_center_test',
        'Runtime persistence connection must target cnc_center_test.',
      );
    } finally {
      await runtimeCheck.end({
        timeout: 5,
      });
    }

    await cleanAuthTables();
  },
);

beforeEach(
  async () => {
    await cleanAuthTables();
  },
);

after(
  async () => {
    await cleanAuthTables();

    await closeDatabase();

    await migrationSql.end({
      timeout: 5,
    });
  },
);

test(
  'canonical admin lookup returns credential state and rejects noncanonical input',
  async () => {
    const passwordChangedAt =
      new Date(
        '2026-08-29T10:00:00.000Z',
      );

    const lastLoginAt =
      new Date(
        '2026-08-29T11:00:00.000Z',
      );

    const inserted =
      await insertAdmin({
        email:
          'lookup@example.test',

        passwordHash:
          '$argon2id$lookup-test',

        passwordChangedAt,
        lastLoginAt,
      });

    const record =
      await getAdminByCanonicalEmail(
        'lookup@example.test',
      );

    assert.ok(record);

    assert.equal(
      record.id,
      inserted.id,
    );

    assert.equal(
      record.email,
      'lookup@example.test',
    );

    assert.equal(
      record.passwordHash,
      '$argon2id$lookup-test',
    );

    assert.equal(
      record.isActive,
      true,
    );

    assert.equal(
      record.passwordChangedAt.getTime(),
      passwordChangedAt.getTime(),
    );

    assert.equal(
      record.lastLoginAt?.getTime(),
      lastLoginAt.getTime(),
    );

    assert.equal(
      await getAdminByCanonicalEmail(
        'missing@example.test',
      ),
      null,
    );

    await assert.rejects(
      getAdminByCanonicalEmail(
        ' LOOKUP@example.test ',
      ),
      /canonical/i,
    );
  },
);

test(
  'password rehash updates only the hash/update timestamp and preserves passwordChangedAt',
  async () => {
    const passwordChangedAt =
      new Date(
        '2026-08-20T09:00:00.000Z',
      );

    const originalUpdatedAt =
      new Date(
        '2026-08-20T09:00:00.000Z',
      );

    const rehashUpdatedAt =
      new Date(
        '2026-08-29T14:00:00.000Z',
      );

    const inserted =
      await insertAdmin({
        email:
          'rehash@example.test',

        passwordHash:
          '$argon2id$old-hash',

        passwordChangedAt,
        updatedAt:
          originalUpdatedAt,
      });

    const updated =
      await updateAdminPasswordHashIfCurrent(
        inserted.id,
        '$argon2id$old-hash',
        '$argon2id$new-hash',
        rehashUpdatedAt,
      );

    assert.equal(
      updated,
      true,
    );

    const rows =
      await migrationSql`
        select
          password_hash,
          password_changed_at,
          updated_at
        from admins
        where id = ${inserted.id}
      `;

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      rows[0].password_hash,
      '$argon2id$new-hash',
    );

    assert.equal(
      rows[0].password_changed_at
        .getTime(),
      passwordChangedAt.getTime(),
    );

    assert.equal(
      rows[0].updated_at.getTime(),
      rehashUpdatedAt.getTime(),
    );
  },
);

test(
  'password rehash optimistic guard rejects stale hash and inactive admin',
  async () => {
    const active =
      await insertAdmin({
        email:
          'rehash-stale@example.test',

        passwordHash:
          '$argon2id$current-hash',
      });

    assert.equal(
      await updateAdminPasswordHashIfCurrent(
        active.id,
        '$argon2id$stale-hash',
        '$argon2id$replacement',
        new Date(
          '2026-08-29T14:10:00.000Z',
        ),
      ),
      false,
    );

    const inactive =
      await insertAdmin({
        email:
          'rehash-inactive@example.test',

        passwordHash:
          '$argon2id$inactive-hash',

        isActive: false,
      });

    assert.equal(
      await updateAdminPasswordHashIfCurrent(
        inactive.id,
        '$argon2id$inactive-hash',
        '$argon2id$replacement',
        new Date(
          '2026-08-29T14:20:00.000Z',
        ),
      ),
      false,
    );
  },
);

test(
  'concurrent password rehashes with the same expected hash yield exactly one winner',
  async () => {
    const passwordChangedAt =
      new Date(
        '2026-08-19T08:00:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'rehash-race@example.test',

        passwordHash:
          '$argon2id$race-old-hash',

        passwordChangedAt,
      });

    const firstReplacement =
      '$argon2id$race-new-hash-a';

    const secondReplacement =
      '$argon2id$race-new-hash-b';

    const [
      first,
      second,
    ] =
      await Promise.all([
        updateAdminPasswordHashIfCurrent(
          admin.id,
          '$argon2id$race-old-hash',
          firstReplacement,
          new Date(
            '2026-08-29T14:25:00.000Z',
          ),
        ),

        updateAdminPasswordHashIfCurrent(
          admin.id,
          '$argon2id$race-old-hash',
          secondReplacement,
          new Date(
            '2026-08-29T14:25:01.000Z',
          ),
        ),
      ]);

    assert.equal(
      Number(first) +
      Number(second),
      1,
    );

    assert.notEqual(
      first,
      second,
    );

    const rows =
      await migrationSql`
        select
          password_hash,
          password_changed_at
        from admins
        where id = ${admin.id}
      `;

    assert.equal(
      rows.length,
      1,
    );

    assert.ok(
      [
        firstReplacement,
        secondReplacement,
      ].includes(
        rows[0].password_hash,
      ),
    );

    assert.equal(
      rows[0].password_changed_at
        .getTime(),
      passwordChangedAt.getTime(),
    );
  },
);

test(
  'TOTP factor insert persists only encrypted material in canonical unconfirmed state',
  async () => {
    const admin =
      await insertAdmin({
        email:
          'totp-insert@example.test',
      });

    const input =
      totpInput(
        admin.id,
      );

    const factor =
      await runAuthTransaction(
        (tx) =>
          tx.insertAdminTotpFactor(
            input,
          ),
      );

    assert.equal(
      factor.adminId,
      admin.id,
    );

    assert.deepEqual(
      factor.secretCiphertext,
      input.secretCiphertext,
    );

    assert.deepEqual(
      factor.secretNonce,
      input.secretNonce,
    );

    assert.deepEqual(
      factor.secretAuthTag,
      input.secretAuthTag,
    );

    assert.equal(
      factor.keyVersion,
      1,
    );

    assert.equal(
      factor.lastUsedCounter,
      null,
    );

    assert.equal(
      factor.confirmedAt,
      null,
    );

    const rows =
      await migrationSql`
        select
          octet_length(
            secret_ciphertext
          ) as ciphertext_length,
          octet_length(
            secret_nonce
          ) as nonce_length,
          octet_length(
            secret_auth_tag
          ) as auth_tag_length,
          key_version,
          last_used_counter,
          confirmed_at
        from admin_totp_factors
        where id = ${factor.id}
      `;

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      rows[0].ciphertext_length,
      5,
    );

    assert.equal(
      rows[0].nonce_length,
      12,
    );

    assert.equal(
      rows[0].auth_tag_length,
      16,
    );

    assert.equal(
      rows[0].key_version,
      1,
    );

    assert.equal(
      rows[0].last_used_counter,
      null,
    );

    assert.equal(
      rows[0].confirmed_at,
      null,
    );
  },
);

test(
  'TOTP factor insert validation fails closed before malformed encrypted state reaches PostgreSQL',
  async () => {
    const admin =
      await insertAdmin({
        email:
          'totp-invalid@example.test',
      });

    const invalid =
      {
        ...totpInput(
          admin.id,
        ),

        secretNonce:
          new Uint8Array([
            1,
            2,
          ]),
      };

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.insertAdminTotpFactor(
            invalid,
          ),
      ),
      /12 bytes/i,
    );

    const rows =
      await migrationSql`
        select count(*)::int as count
        from admin_totp_factors
        where admin_id = ${admin.id}
      `;

    assert.equal(
      rows[0].count,
      0,
    );
  },
);

test(
  'TOTP confirmation atomically transitions unconfirmed factor and is one-time',
  async () => {
    const admin =
      await insertAdmin({
        email:
          'totp-confirm@example.test',
      });

    const factor =
      await runAuthTransaction(
        (tx) =>
          tx.insertAdminTotpFactor(
            totpInput(
              admin.id,
            ),
          ),
      );

    const confirmedAt =
      new Date(
        '2026-08-29T14:30:00.000Z',
      );

    const first =
      await runAuthTransaction(
        (tx) =>
          tx.confirmAdminTotpFactor(
            factor.id,
            factor.updatedAt,
            123456,
            confirmedAt,
          ),
      );

    assert.equal(
      first,
      true,
    );

    const second =
      await runAuthTransaction(
        (tx) =>
          tx.confirmAdminTotpFactor(
            factor.id,
            factor.updatedAt,
            123457,
            new Date(
              '2026-08-29T14:31:00.000Z',
            ),
          ),
      );

    assert.equal(
      second,
      false,
    );

    const rows =
      await migrationSql`
        select
          last_used_counter,
          confirmed_at,
          updated_at
        from admin_totp_factors
        where id = ${factor.id}
      `;

    assert.equal(
      rows.length,
      1,
    );

    assert.equal(
      Number(
        rows[0].last_used_counter,
      ),
      123456,
    );

    assert.equal(
      rows[0].confirmed_at
        .getTime(),
      confirmedAt.getTime(),
    );

    assert.equal(
      rows[0].updated_at
        .getTime(),
      confirmedAt.getTime(),
    );
  },
);

test(
  'concurrent TOTP confirmations with the same expected state yield exactly one winner',
  async () => {
    const admin =
      await insertAdmin({
        email:
          'totp-race@example.test',
      });

    const factor =
      await runAuthTransaction(
        (tx) =>
          tx.insertAdminTotpFactor(
            totpInput(
              admin.id,
            ),
          ),
      );

    const [
      first,
      second,
    ] =
      await Promise.all([
        runAuthTransaction(
          (tx) =>
            tx.confirmAdminTotpFactor(
              factor.id,
              factor.updatedAt,
              200001,
              new Date(
                '2026-08-29T15:00:00.000Z',
              ),
            ),
        ),

        runAuthTransaction(
          (tx) =>
            tx.confirmAdminTotpFactor(
              factor.id,
              factor.updatedAt,
              200002,
              new Date(
                '2026-08-29T15:00:01.000Z',
              ),
            ),
        ),
      ]);

    assert.equal(
      Number(first) +
      Number(second),
      1,
    );

    const rows =
      await migrationSql`
        select
          last_used_counter,
          confirmed_at
        from admin_totp_factors
        where id = ${factor.id}
      `;

    assert.equal(
      rows.length,
      1,
    );

    assert.ok(
      [
        200001,
        200002,
      ].includes(
        Number(
          rows[0].last_used_counter,
        ),
      ),
    );

    assert.ok(
      rows[0].confirmed_at
        instanceof Date,
    );
  },
);

test(
  'recovery provisioning inserts exactly ten unique hash-only active records',
  async () => {
    const admin =
      await insertAdmin({
        email:
          'recovery@example.test',
      });

    const inputs =
      recoveryInputs(
        admin.id,
      );

    await runAuthTransaction(
      (tx) =>
        tx.insertAdminRecoveryCodes(
          inputs,
        ),
    );

    const rows =
      await migrationSql`
        select
          admin_id,
          code_hash,
          used_at,
          revoked_at
        from admin_recovery_codes
        where admin_id = ${admin.id}
        order by code_hash
      `;

    assert.equal(
      rows.length,
      10,
    );

    assert.deepEqual(
      rows.map(
        (row) =>
          row.code_hash,
      ),
      inputs
        .map(
          (input) =>
            input.codeHash,
        )
        .sort(),
    );

    for (const row of rows) {
      assert.equal(
        row.admin_id,
        admin.id,
      );

      assert.match(
        row.code_hash,
        /^[0-9a-f]{64}$/,
      );

      assert.equal(
        row.used_at,
        null,
      );

      assert.equal(
        row.revoked_at,
        null,
      );
    }
  },
);

test(
  'recovery provisioning validation and transaction rollback leave no partial records',
  async () => {
    const admin =
      await insertAdmin({
        email:
          'recovery-rollback@example.test',
      });

    const onlyNine =
      recoveryInputs(
        admin.id,
      ).slice(
        0,
        9,
      );

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.insertAdminRecoveryCodes(
            onlyNine,
          ),
      ),
      /exactly ten/i,
    );

    const duplicated =
      recoveryInputs(
        admin.id,
      );

    duplicated[9] = {
      ...duplicated[9],
      codeHash:
        duplicated[0].codeHash,
    };

    await assert.rejects(
      runAuthTransaction(
        (tx) =>
          tx.insertAdminRecoveryCodes(
            duplicated,
          ),
      ),
      /unique/i,
    );

    const valid =
      recoveryInputs(
        admin.id,
      );

    await assert.rejects(
      runAuthTransaction(
        async (tx) => {
          await tx
            .insertAdminRecoveryCodes(
              valid,
            );

          throw new Error(
            'intentional rollback marker',
          );
        },
      ),
      /intentional rollback marker/,
    );

    const rows =
      await migrationSql`
        select count(*)::int as count
        from admin_recovery_codes
        where admin_id = ${admin.id}
      `;

    assert.equal(
      rows[0].count,
      0,
    );
  },
);