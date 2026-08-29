import assert from 'node:assert/strict';
import {
  after,
  afterEach,
  before,
  test,
} from 'node:test';

import postgres from 'postgres';

process.loadEnvFile(
  '.env.local',
);

for (
  const name of [
    'TEST_DATABASE_MIGRATION_URL',
    'TEST_DATABASE_URL',
  ]
) {
  if (
    typeof process.env[name] !==
      'string' ||
    process.env[name].length === 0
  ) {
    throw new Error(
      `${name} is required for the prepare-enrollment DB-backed test suite.`,
    );
  }
}

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL;

const TEST_TOTP_ENCRYPTION_KEY =
  Buffer.alloc(
    32,
    11,
  );

process.env.ADMIN_TOTP_ENCRYPTION_KEY =
  TEST_TOTP_ENCRYPTION_KEY
    .toString(
      'base64url',
    );

const [
  {
    prepareAdminTotpEnrollment,
  },
  {
    closeDatabase,
  },
  {
    hashPassword,
  },
  {
    generateOpaqueAuthToken,
    hashOpaqueAuthToken,
  },
  {
    decryptTotpSecret,
    encryptTotpSecret,
  },
  {
    generateTotpSecret,
    totpSecretToBase32,
  },
] =
  await Promise.all([
    import(
      '../../src/server/auth/service.ts'
    ),
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/auth/password.ts'
    ),
    import(
      '../../src/server/auth/tokens.ts'
    ),
    import(
      '../../src/server/auth/totp-secret.ts'
    ),
    import(
      '../../src/server/auth/totp.ts'
    ),
  ]);

const migrationSql =
  postgres(
    process.env
      .TEST_DATABASE_MIGRATION_URL,
    {
      max: 2,
      prepare: false,
    },
  );

const ownedAdminIds =
  new Set();

let reusablePasswordHash;

async function assertTestDatabase() {
  const [row] =
    await migrationSql`
      select
        current_database() as name
    `;

  assert.equal(
    row.name,
    'cnc_center_test',
  );
}

async function authTableCounts() {
  return migrationSql`
    select
      'admins' as table_name,
      count(*)::int as row_count
    from admins

    union all

    select
      'admin_login_challenges',
      count(*)::int
    from admin_login_challenges

    union all

    select
      'admin_totp_factors',
      count(*)::int
    from admin_totp_factors

    union all

    select
      'admin_recovery_codes',
      count(*)::int
    from admin_recovery_codes

    union all

    select
      'admin_sessions',
      count(*)::int
    from admin_sessions

    union all

    select
      'admin_auth_throttles',
      count(*)::int
    from admin_auth_throttles

    order by table_name
  `;
}

async function assertAuthTablesEmpty() {
  const rows =
    await authTableCounts();

  for (const row of rows) {
    assert.equal(
      row.row_count,
      0,
      `${row.table_name} must be empty`,
    );
  }
}

async function cleanupOwnedRows() {
  for (
    const adminId of
    ownedAdminIds
  ) {
    await migrationSql`
      delete from admin_sessions
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admin_recovery_codes
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admin_totp_factors
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admin_login_challenges
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete from admins
      where id = ${adminId}
    `;
  }

  ownedAdminIds.clear();
}

async function insertAdmin({
  email,
  now,
  isActive = true,
  lastLoginAt = null,
}) {
  const [row] =
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
        ${reusablePasswordHash},
        ${isActive},
        ${now},
        ${lastLoginAt},
        ${now},
        ${now}
      )
      returning
        id,
        email
    `;

  ownedAdminIds.add(
    row.id,
  );

  return row;
}

async function insertChallenge({
  adminId,
  challengeToken,
  now,
  type = 'enrollment',
  expiresAt =
    new Date(
      now.getTime() +
        5 * 60 * 1000,
    ),
  attemptCount = 0,
  consumedAt = null,
  invalidatedAt = null,
  createdAt = now,
}) {
  const tokenHash =
    hashOpaqueAuthToken(
      challengeToken,
    );

  const [row] =
    await migrationSql`
      insert into admin_login_challenges (
        admin_id,
        token_hash,
        type,
        attempt_count,
        expires_at,
        consumed_at,
        invalidated_at,
        created_at
      )
      values (
        ${adminId},
        ${tokenHash},
        ${type},
        ${attemptCount},
        ${expiresAt},
        ${consumedAt},
        ${invalidatedAt},
        ${createdAt}
      )
      returning
        id,
        token_hash,
        type,
        attempt_count,
        expires_at,
        consumed_at,
        invalidated_at
    `;

  return row;
}

async function insertTotpFactor({
  adminId,
  now,
  secret =
    generateTotpSecret(),
  confirmedAt = null,
  lastUsedCounter = null,
  tamperAuthTag = false,
}) {
  const encrypted =
    encryptTotpSecret(
      secret,
      TEST_TOTP_ENCRYPTION_KEY,
    );

  const authTag =
    Buffer.from(
      encrypted.secretAuthTag,
    );

  if (tamperAuthTag) {
    authTag[0] ^=
      0xff;
  }

  const [row] =
    await migrationSql`
      insert into admin_totp_factors (
        admin_id,
        secret_ciphertext,
        secret_nonce,
        secret_auth_tag,
        key_version,
        last_used_counter,
        confirmed_at,
        created_at,
        updated_at
      )
      values (
        ${adminId},
        ${encrypted.secretCiphertext},
        ${encrypted.secretNonce},
        ${authTag},
        ${encrypted.keyVersion},
        ${lastUsedCounter},
        ${confirmedAt},
        ${now},
        ${now}
      )
      returning
        id,
        admin_id,
        secret_ciphertext,
        secret_nonce,
        secret_auth_tag,
        key_version,
        last_used_counter,
        confirmed_at,
        created_at,
        updated_at
    `;

  return {
    row,
    secret,
  };
}

async function factorRowsFor(
  adminId,
) {
  return migrationSql`
    select
      id,
      admin_id,
      secret_ciphertext,
      secret_nonce,
      secret_auth_tag,
      key_version,
      last_used_counter,
      confirmed_at,
      created_at,
      updated_at
    from admin_totp_factors
    where admin_id = ${adminId}
    order by created_at, id
  `;
}

async function challengeState(
  challengeId,
) {
  const [row] =
    await migrationSql`
      select
        attempt_count,
        consumed_at,
        invalidated_at
      from admin_login_challenges
      where id = ${challengeId}
    `;

  return row;
}

async function adminState(
  adminId,
) {
  const [row] =
    await migrationSql`
      select
        last_login_at
      from admins
      where id = ${adminId}
    `;

  return row;
}

async function countRows(
  table,
) {
  const allowed =
    new Set([
      'admin_auth_throttles',
      'admin_recovery_codes',
      'admin_sessions',
    ]);

  if (!allowed.has(table)) {
    throw new Error(
      'Unexpected countRows table.',
    );
  }

  const [row] =
    await migrationSql
      .unsafe(
        `select count(*)::int as count from ${table}`,
      );

  return row.count;
}

before(
  async () => {
    await assertTestDatabase();
    await assertAuthTablesEmpty();

    reusablePasswordHash =
      await hashPassword(
        'Prepare-Enrollment-Test-Password-1!',
      );
  },
);

afterEach(
  async () => {
    await cleanupOwnedRows();
  },
);

after(
  async () => {
    await cleanupOwnedRows();

    await closeDatabase();

    await assertAuthTablesEmpty();

    await migrationSql.end({
      timeout: 5,
    });
  },
);

test(
  'valid enrollment challenge creates one encrypted unconfirmed TOTP factor and returns the canonical enrollment payload without unrelated auth mutations',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:00:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'prepare-success@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const result =
      await prepareAdminTotpEnrollment({
        challengeToken,
        now,
      });

    assert.equal(
      result.ok,
      true,
    );

    assert.match(
      result.secretBase32,
      /^[A-Z2-7]+$/u,
    );

    const enrollmentUrl =
      new URL(
        result.enrollmentUri,
      );

    assert.equal(
      enrollmentUrl.protocol,
      'otpauth:',
    );

    assert.equal(
      enrollmentUrl.hostname,
      'totp',
    );

    assert.equal(
      enrollmentUrl.searchParams.get(
        'issuer',
      ),
      'CNC Center',
    );

    assert.equal(
      enrollmentUrl.searchParams.get(
        'secret',
      ),
      result.secretBase32,
    );

    assert.ok(
      decodeURIComponent(
        enrollmentUrl.pathname,
      ).includes(
        admin.email,
      ),
    );

    const factors =
      await factorRowsFor(
        admin.id,
      );

    assert.equal(
      factors.length,
      1,
    );

    const factor =
      factors[0];

    assert.equal(
      factor.confirmed_at,
      null,
    );

    assert.equal(
      factor.last_used_counter,
      null,
    );

    assert.equal(
      factor.key_version,
      1,
    );

    const decrypted =
      decryptTotpSecret(
        {
          secretCiphertext:
            Buffer.from(
              factor.secret_ciphertext,
            ),
          secretNonce:
            Buffer.from(
              factor.secret_nonce,
            ),
          secretAuthTag:
            Buffer.from(
              factor.secret_auth_tag,
            ),
          keyVersion:
            factor.key_version,
        },
        TEST_TOTP_ENCRYPTION_KEY,
      );

    assert.equal(
      totpSecretToBase32(
        decrypted,
      ),
      result.secretBase32,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge
        .consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge
        .invalidated_at,
      null,
    );

    const persistedAdmin =
      await adminState(
        admin.id,
      );

    assert.equal(
      persistedAdmin
        .last_login_at,
      null,
    );

    assert.equal(
      await countRows(
        'admin_sessions',
      ),
      0,
    );

    assert.equal(
      await countRows(
        'admin_recovery_codes',
      ),
      0,
    );

    assert.equal(
      await countRows(
        'admin_auth_throttles',
      ),
      0,
    );
  },
);

test(
  'repeated preparation reuses the existing unconfirmed TOTP secret instead of rotating or inserting a second factor',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:10:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'prepare-reuse@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    await insertChallenge({
      adminId:
        admin.id,
      challengeToken,
      now,
    });

    const first =
      await prepareAdminTotpEnrollment({
        challengeToken,
        now,
      });

    assert.equal(
      first.ok,
      true,
    );

    const firstFactors =
      await factorRowsFor(
        admin.id,
      );

    assert.equal(
      firstFactors.length,
      1,
    );

    const secondNow =
      new Date(
        now.getTime() +
          30 * 1000,
      );

    const second =
      await prepareAdminTotpEnrollment({
        challengeToken,
        now:
          secondNow,
      });

    assert.equal(
      second.ok,
      true,
    );

    assert.equal(
      second.secretBase32,
      first.secretBase32,
    );

    assert.equal(
      second.enrollmentUri,
      first.enrollmentUri,
    );

    const secondFactors =
      await factorRowsFor(
        admin.id,
      );

    assert.equal(
      secondFactors.length,
      1,
    );

    assert.equal(
      secondFactors[0].id,
      firstFactors[0].id,
    );

    assert.deepEqual(
      Buffer.from(
        secondFactors[0]
          .secret_ciphertext,
      ),
      Buffer.from(
        firstFactors[0]
          .secret_ciphertext,
      ),
    );

    assert.deepEqual(
      Buffer.from(
        secondFactors[0]
          .secret_nonce,
      ),
      Buffer.from(
        firstFactors[0]
          .secret_nonce,
      ),
    );

    assert.deepEqual(
      Buffer.from(
        secondFactors[0]
          .secret_auth_tag,
      ),
      Buffer.from(
        firstFactors[0]
          .secret_auth_tag,
      ),
    );

    assert.equal(
      secondFactors[0]
        .updated_at
        .getTime(),
      firstFactors[0]
        .updated_at
        .getTime(),
    );
  },
);

test(
  'confirmed TOTP factor makes an enrollment challenge invalid and is never rotated',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:20:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'prepare-confirmed@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const {
      row: factorBefore,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
        confirmedAt:
          now,
        lastUsedCounter:
          123,
      });

    const result =
      await prepareAdminTotpEnrollment({
        challengeToken,
        now,
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    const factors =
      await factorRowsFor(
        admin.id,
      );

    assert.equal(
      factors.length,
      1,
    );

    assert.equal(
      factors[0].id,
      factorBefore.id,
    );

    assert.equal(
      factors[0]
        .confirmed_at
        .getTime(),
      now.getTime(),
    );

    assert.equal(
      Number(
        factors[0]
          .last_used_counter,
      ),
      123,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );
  },
);

test(
  'expired consumed invalidated and wrong-type challenges all fail as invalid_challenge without provisioning a factor',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:30:00.000Z',
      );

    const cases = [
      {
        name: 'expired',
        type: 'enrollment',
        createdAt:
          new Date(
            now.getTime() -
              10 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() -
              5 * 60 * 1000,
          ),
        consumedAt: null,
        invalidatedAt: null,
      },
      {
        name: 'consumed',
        type: 'enrollment',
        createdAt:
          new Date(
            now.getTime() -
              2 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() +
              3 * 60 * 1000,
          ),
        consumedAt:
          new Date(
            now.getTime() -
              60 * 1000,
          ),
        invalidatedAt: null,
      },
      {
        name: 'invalidated',
        type: 'enrollment',
        createdAt:
          new Date(
            now.getTime() -
              2 * 60 * 1000,
          ),
        expiresAt:
          new Date(
            now.getTime() +
              3 * 60 * 1000,
          ),
        consumedAt: null,
        invalidatedAt:
          new Date(
            now.getTime() -
              60 * 1000,
          ),
      },
      {
        name: 'wrong-type',
        type: 'mfa',
        createdAt: now,
        expiresAt:
          new Date(
            now.getTime() +
              5 * 60 * 1000,
          ),
        consumedAt: null,
        invalidatedAt: null,
      },
    ];

    for (
      const scenario of
      cases
    ) {
      const admin =
        await insertAdmin({
          email:
            `prepare-${scenario.name}@example.com`,
          now:
            scenario.createdAt,
        });

      const challengeToken =
        generateOpaqueAuthToken();

      const challenge =
        await insertChallenge({
          adminId:
            admin.id,
          challengeToken,
          now:
            scenario.createdAt,
          type:
            scenario.type,
          createdAt:
            scenario.createdAt,
          expiresAt:
            scenario.expiresAt,
          consumedAt:
            scenario.consumedAt,
          invalidatedAt:
            scenario.invalidatedAt,
        });

      const result =
        await prepareAdminTotpEnrollment({
          challengeToken,
          now,
        });

      assert.deepEqual(
        result,
        {
          ok: false,
          reason:
            'invalid_challenge',
        },
        scenario.name,
      );

      const factors =
        await factorRowsFor(
          admin.id,
        );

      assert.equal(
        factors.length,
        0,
        scenario.name,
      );

      const persistedChallenge =
        await challengeState(
          challenge.id,
        );

      assert.equal(
        persistedChallenge
          .attempt_count,
        0,
        scenario.name,
      );
    }
  },
);

test(
  'disabled admin fails closed as invalid_challenge and preparation does not create a factor',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:40:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'prepare-disabled@example.com',
        now,
        isActive:
          false,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const result =
      await prepareAdminTotpEnrollment({
        challengeToken,
        now,
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    assert.equal(
      (
        await factorRowsFor(
          admin.id,
        )
      ).length,
      0,
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge
        .consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge
        .invalidated_at,
      null,
    );
  },
);

test(
  'tampered persisted encrypted TOTP material fails closed instead of silently rotating the enrollment secret',
  async () => {
    const now =
      new Date(
        '2026-08-29T17:50:00.000Z',
      );

    const admin =
      await insertAdmin({
        email:
          'prepare-tampered@example.com',
        now,
      });

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,
        challengeToken,
        now,
      });

    const {
      row: factorBefore,
    } =
      await insertTotpFactor({
        adminId:
          admin.id,
        now,
        tamperAuthTag:
          true,
      });

    await assert.rejects(
      prepareAdminTotpEnrollment({
        challengeToken,
        now,
      }),
    );

    const factors =
      await factorRowsFor(
        admin.id,
      );

    assert.equal(
      factors.length,
      1,
    );

    assert.equal(
      factors[0].id,
      factorBefore.id,
    );

    assert.deepEqual(
      Buffer.from(
        factors[0]
          .secret_ciphertext,
      ),
      Buffer.from(
        factorBefore
          .secret_ciphertext,
      ),
    );

    assert.deepEqual(
      Buffer.from(
        factors[0]
          .secret_nonce,
      ),
      Buffer.from(
        factorBefore
          .secret_nonce,
      ),
    );

    assert.deepEqual(
      Buffer.from(
        factors[0]
          .secret_auth_tag,
      ),
      Buffer.from(
        factorBefore
          .secret_auth_tag,
      ),
    );

    const persistedChallenge =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      persistedChallenge
        .attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge
        .consumed_at,
      null,
    );

    assert.equal(
      persistedChallenge
        .invalidated_at,
      null,
    );
  },
);
