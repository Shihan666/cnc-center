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

const originalDatabaseUrl =
  process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for HTTP login integration tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for HTTP login integration tests.',
  );
}

if (
  originalDatabaseUrl?.trim() ===
  testDatabaseUrl
) {
  throw new Error(
    'TEST_DATABASE_URL must not equal the original DATABASE_URL.',
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

const TEST_THROTTLE_HMAC_KEY =
  Buffer.alloc(
    32,
    29,
  );

process.env.ADMIN_AUTH_THROTTLE_HMAC_KEY =
  TEST_THROTTLE_HMAC_KEY.toString(
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
    hashAuthThrottleKey,
  },
  {
    hashPassword,
  },
  {
    hashOpaqueAuthToken,
  },
] =
  await Promise.all([
    import(
      '../../src/pages/api/admin/auth/login.ts'
    ),
    import(
      '../../src/server/db/client.ts'
    ),
    import(
      '../../src/server/auth/hmac.ts'
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
  'HTTP-Login-Integration-Test-1!';

const ownedAdminIds =
  new Set();

const ownedThrottlePairs =
  new Map();

let reusablePasswordHash;

function canonicalEmail(
  value,
) {
  return value
    .trim()
    .toLowerCase();
}

function rememberThrottle(
  scope,
  keyHash,
) {
  ownedThrottlePairs.set(
    `${scope}:${keyHash}`,
    {
      scope,
      keyHash,
    },
  );
}

function rememberPasswordThrottleKeys(
  email,
  clientIp,
) {
  const account =
    hashAuthThrottleKey(
      'password_account',
      canonicalEmail(
        email,
      ),
      TEST_THROTTLE_HMAC_KEY,
    );

  const ip =
    hashAuthThrottleKey(
      'password_ip',
      clientIp,
      TEST_THROTTLE_HMAC_KEY,
    );

  rememberThrottle(
    'password_account',
    account,
  );

  rememberThrottle(
    'password_ip',
    ip,
  );

  return {
    account,
    ip,
  };
}
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

async function createAdmin() {
  const email =
    `http-login.${randomUUID()}@example.test`;

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

  return {
    id:
      row.id,

    email:
      row.email,

    password:
      TEST_PASSWORD,
  };
}

async function cleanupOwnedRows() {
  for (
    const {
      scope,
      keyHash,
    } of
    ownedThrottlePairs.values()
  ) {
    await migrationSql`
      delete
      from admin_auth_throttles
      where
        scope = ${scope}
        and
        key_hash = ${keyHash}
    `;
  }

  ownedThrottlePairs.clear();

  for (
    const adminId of
    ownedAdminIds
  ) {
    await migrationSql`
      delete
      from admin_sessions
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete
      from admin_recovery_codes
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete
      from admin_totp_factors
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete
      from admin_login_challenges
      where admin_id = ${adminId}
    `;

    await migrationSql`
      delete
      from admins
      where id = ${adminId}
    `;
  }

  ownedAdminIds.clear();
}

async function challengeRows(
  adminId,
) {
  return migrationSql`
    select
      token_hash,
      type,
      attempt_count,
      expires_at,
      consumed_at,
      invalidated_at
    from admin_login_challenges
    where admin_id = ${adminId}
    order by created_at, id
  `;
}

async function seedBlockedAccountThrottle({
  email,
  clientIp,
}) {
  const keys =
    rememberPasswordThrottleKeys(
      email,
      clientIp,
    );

  const now =
    new Date();

  const blockedUntil =
    new Date(
      now.getTime() +
        15 * 60 * 1_000,
    );

  await migrationSql`
    insert into admin_auth_throttles (
      scope,
      key_hash,
      failure_count,
      window_started_at,
      last_failure_at,
      blocked_until,
      created_at,
      updated_at
    )
    values (
      'password_account',
      ${keys.account},
      5,
      ${now},
      ${now},
      ${blockedUntil},
      ${now},
      ${now}
    )
  `;
}

function createCookieRecorder() {
  const setCalls = [];
  const deleteCalls = [];

  return {
    setCalls,
    deleteCalls,

    cookies: {
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
function createLoginContext({
  email,
  password,
  clientIp,
  recorder,
}) {
  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/login',
        {
          method: 'POST',

          headers: {
            origin:
              'http://localhost:4321',

            'content-type':
              'application/json',
          },

          body:
            JSON.stringify({
              email,
              password,
            }),
        },
      ),

    cookies:
      recorder.cookies,

    site:
      new URL(
        'http://localhost:4321',
      ),

    clientAddress:
      clientIp,
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
    await cleanupOwnedRows();

    await closeDatabase();

    await migrationSql.end({
      timeout: 5,
    });

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
  },
);
test(
  'successful password login returns enrollment without leaking the challenge token and stores only its hash',
  async () => {
    const admin =
      await createAdmin();

    const clientIp =
      '203.0.113.71';

    rememberPasswordThrottleKeys(
      admin.email,
      clientIp,
    );

    const recorder =
      createCookieRecorder();

    const response =
      await POST(
        createLoginContext({
          email:
            admin.email,

          password:
            admin.password,

          clientIp,

          recorder,
        }),
      );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    const body =
      await response.json();

    assert.deepEqual(
      body,
      {
        ok: true,
        next: 'enrollment',
      },
    );

    assert.equal(
      Object.hasOwn(
        body,
        'challengeToken',
      ),
      false,
    );

    assert.equal(
      recorder.deleteCalls.length,
      0,
    );

    assert.equal(
      recorder.setCalls.length,
      1,
    );

    const cookie =
      recorder.setCalls[0];

    assert.equal(
      cookie.name,
      'cnc_admin_challenge',
    );

    assert.equal(
      typeof cookie.value,
      'string',
    );

    assert.ok(
      cookie.value.length > 0,
    );

    assert.deepEqual(
      cookie.options,
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/api/admin/auth',
        maxAge: 300,
      },
    );

    assert.equal(
      JSON.stringify(body).includes(
        cookie.value,
      ),
      false,
    );

    const challenges =
      await challengeRows(
        admin.id,
      );

    assert.equal(
      challenges.length,
      1,
    );

    assert.equal(
      challenges[0].token_hash,
      hashOpaqueAuthToken(
        cookie.value,
      ),
    );

    assert.notEqual(
      challenges[0].token_hash,
      cookie.value,
    );

    assert.equal(
      challenges[0].type,
      'enrollment',
    );

    assert.equal(
      challenges[0].attempt_count,
      0,
    );

    assert.equal(
      challenges[0].consumed_at,
      null,
    );

    assert.equal(
      challenges[0].invalidated_at,
      null,
    );
  },
);

test(
  'wrong password maps to 401 invalid_credentials clears the challenge cookie and creates no challenge',
  async () => {
    const admin =
      await createAdmin();

    const clientIp =
      '203.0.113.72';

    rememberPasswordThrottleKeys(
      admin.email,
      clientIp,
    );

    const recorder =
      createCookieRecorder();

    const response =
      await POST(
        createLoginContext({
          email:
            admin.email,

          password:
            'Definitely not the password',

          clientIp,

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
          'invalid_credentials',
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
        await challengeRows(
          admin.id,
        )
      ).length,
      0,
    );
  },
);

test(
  'blocked password account maps to 429 throttled clears the challenge cookie and creates no challenge',
  async () => {
    const admin =
      await createAdmin();

    const clientIp =
      '203.0.113.73';

    await seedBlockedAccountThrottle({
      email:
        admin.email,

      clientIp,
    });

    const recorder =
      createCookieRecorder();

    const response =
      await POST(
        createLoginContext({
          email:
            admin.email,

          password:
            admin.password,

          clientIp,

          recorder,
        }),
      );

    assert.equal(
      response.status,
      429,
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
          'throttled',
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
        await challengeRows(
          admin.id,
        )
      ).length,
      0,
    );
  },
);