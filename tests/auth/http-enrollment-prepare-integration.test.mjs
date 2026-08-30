import assert from 'node:assert/strict';
import {
  randomUUID,
} from 'node:crypto';
import test, {
  after,
  afterEach,
  before,
} from 'node:test';

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
    'TEST_DATABASE_URL is required for enrollment-prepare HTTP integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for enrollment-prepare HTTP integration tests.',
  );
}

const originalDatabaseUrl =
  process.env.DATABASE_URL;

const originalTotpEncryptionKey =
  process.env.ADMIN_TOTP_ENCRYPTION_KEY;

process.env.DATABASE_URL =
  testDatabaseUrl;

const TEST_TOTP_ENCRYPTION_KEY =
  Buffer.alloc(
    32,
    11,
  );

process.env.ADMIN_TOTP_ENCRYPTION_KEY =
  TEST_TOTP_ENCRYPTION_KEY.toString(
    'base64url',
  );

const [
  {
    POST,
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
] =
  await Promise.all([
    import(
      '../../src/pages/api/admin/auth/enrollment/prepare.ts'
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
  ]);

const migrationSql =
  postgres(
    testMigrationUrl,
    {
      max: 2,
      prepare: false,
    },
  );

const EXPECTED_TEST_DATABASE =
  'cnc_center_test';

const TEST_PASSWORD =
  'HTTP-Prepare-Enrollment-Test-1!';

const ownedAdminIds =
  new Set();

let reusablePasswordHash;
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

async function insertAdmin() {
  const email =
    `http-prepare.${randomUUID()}@example.test`;

  const now =
    new Date(
      Date.now() -
        60_000,
    );

  const [row] =
    await migrationSql`
      insert into admins (
        email,
        password_hash,
        is_active,
        password_changed_at,
        created_at,
        updated_at
      )
      values (
        ${email},
        ${reusablePasswordHash},
        true,
        ${now},
        ${now},
        ${now}
      )
      returning
        id,
        email
    `;

  assert.ok(
    row,
  );

  ownedAdminIds.add(
    row.id,
  );

  return row;
}

async function insertChallenge({
  adminId,
  challengeToken,
}) {
  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
        5 * 60 * 1_000,
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
        ${
          hashOpaqueAuthToken(
            challengeToken,
          )
        },
        'enrollment',
        0,
        ${expiresAt},
        null,
        null,
        ${now}
      )
      returning
        id
    `;

  assert.ok(
    row,
  );

  return row;
}

async function factorRowsFor(
  adminId,
) {
  return migrationSql`
    select
      id,
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

  return row ?? null;
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

function createCookieRecorder(
  challengeToken,
) {
  const setCalls = [];
  const deleteCalls = [];

  return {
    setCalls,
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        if (
          name !==
          'cnc_admin_challenge'
        ) {
          return undefined;
        }

        return {
          value:
            challengeToken,
        };
      },

      set(
        name,
        value,
        options,
      ) {
        setCalls.push({
          name,
          value,
          options,
        });
      },

      delete(
        name,
        options,
      ) {
        deleteCalls.push({
          name,
          options,
        });
      },
    },
  };
}

function createPrepareContext({
  recorder,
}) {
  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/enrollment/prepare',
        {
          method: 'POST',

          headers: {
            origin:
              'http://localhost:4321',

            'content-type':
              'application/json',
          },

          body:
            '{}',
        },
      ),

    cookies:
      recorder.cookies,

    site:
      new URL(
        'http://localhost:4321',
      ),

    clientAddress:
      '127.0.0.1',
  };
}
before(
  async () => {
    await assertTestDatabase();

    reusablePasswordHash =
      await hashPassword(
        TEST_PASSWORD,
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

      if (
        originalTotpEncryptionKey ===
        undefined
      ) {
        delete process.env
          .ADMIN_TOTP_ENCRYPTION_KEY;
      } else {
        process.env.ADMIN_TOTP_ENCRYPTION_KEY =
          originalTotpEncryptionKey;
      }
    }
  },
);
async function invalidateChallenge(
  challengeId,
) {
  const now =
    new Date();

  await migrationSql`
    update admin_login_challenges
    set invalidated_at = ${now}
    where id = ${challengeId}
  `;
}

test(
  'successful enrollment prepare returns no-store TOTP material and repeated prepare reuses one unconfirmed factor without rotating the challenge',
  async () => {
    const admin =
      await insertAdmin();

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,

        challengeToken,
      });

    const firstRecorder =
      createCookieRecorder(
        challengeToken,
      );

    const firstResponse =
      await POST(
        createPrepareContext({
          recorder:
            firstRecorder,
        }),
      );

    assert.equal(
      firstResponse.status,
      200,
    );

    assert.equal(
      firstResponse.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.equal(
      firstResponse.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    const firstBody =
      await firstResponse.json();

    assert.equal(
      firstBody.ok,
      true,
    );

    assert.equal(
      Object.hasOwn(
        firstBody,
        'challengeToken',
      ),
      false,
    );

    assert.match(
      firstBody.secretBase32,
      /^[A-Z2-7]+$/u,
    );

    const enrollmentUrl =
      new URL(
        firstBody.enrollmentUri,
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
        'secret',
      ),
      firstBody.secretBase32,
    );

    assert.ok(
      decodeURIComponent(
        enrollmentUrl.pathname,
      ).includes(
        admin.email,
      ),
    );

    assert.equal(
      firstRecorder.setCalls.length,
      0,
    );

    assert.equal(
      firstRecorder.deleteCalls.length,
      0,
    );

    const firstFactors =
      await factorRowsFor(
        admin.id,
      );

    assert.equal(
      firstFactors.length,
      1,
    );

    const firstFactor =
      firstFactors[0];

    assert.equal(
      firstFactor.confirmed_at,
      null,
    );

    assert.equal(
      firstFactor.last_used_counter,
      null,
    );

    assert.equal(
      firstFactor.key_version,
      1,
    );

    assert.ok(
      Buffer.from(
        firstFactor.secret_ciphertext,
      ).length > 0,
    );

    assert.ok(
      Buffer.from(
        firstFactor.secret_nonce,
      ).length > 0,
    );

    assert.ok(
      Buffer.from(
        firstFactor.secret_auth_tag,
      ).length > 0,
    );

    const challengeAfterFirst =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterFirst.attempt_count,
      0,
    );

    assert.equal(
      challengeAfterFirst.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterFirst.invalidated_at,
      null,
    );

    const secondRecorder =
      createCookieRecorder(
        challengeToken,
      );

    const secondResponse =
      await POST(
        createPrepareContext({
          recorder:
            secondRecorder,
        }),
      );

    assert.equal(
      secondResponse.status,
      200,
    );

    const secondBody =
      await secondResponse.json();

    assert.deepEqual(
      secondBody,
      firstBody,
    );

    assert.equal(
      secondRecorder.setCalls.length,
      0,
    );

    assert.equal(
      secondRecorder.deleteCalls.length,
      0,
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
      firstFactor.id,
    );

    assert.deepEqual(
      Buffer.from(
        secondFactors[0]
          .secret_ciphertext,
      ),
      Buffer.from(
        firstFactor
          .secret_ciphertext,
      ),
    );

    const challengeAfterSecond =
      await challengeState(
        challenge.id,
      );

    assert.equal(
      challengeAfterSecond.attempt_count,
      0,
    );

    assert.equal(
      challengeAfterSecond.consumed_at,
      null,
    );

    assert.equal(
      challengeAfterSecond.invalidated_at,
      null,
    );
  },
);

test(
  'persisted invalid enrollment challenge maps to 401 clears the challenge cookie and creates no TOTP factor',
  async () => {
    const admin =
      await insertAdmin();

    const challengeToken =
      generateOpaqueAuthToken();

    const challenge =
      await insertChallenge({
        adminId:
          admin.id,

        challengeToken,
      });

    await invalidateChallenge(
      challenge.id,
    );

    const recorder =
      createCookieRecorder(
        challengeToken,
      );

    const response =
      await POST(
        createPrepareContext({
          recorder,
        }),
      );

    assert.equal(
      response.status,
      401,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
    );

    assert.equal(
      recorder.setCalls.length,
      0,
    );

    assert.deepEqual(
      recorder.deleteCalls,
      [
        {
          name:
            'cnc_admin_challenge',

          options: {
            httpOnly: true,
            sameSite: 'strict',
            secure: false,
            path:
              '/api/admin/auth',
          },
        },
      ],
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
      persistedChallenge.attempt_count,
      0,
    );

    assert.equal(
      persistedChallenge.consumed_at,
      null,
    );

    assert.ok(
      persistedChallenge.invalidated_at,
    );
  },
);