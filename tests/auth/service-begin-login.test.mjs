import assert from 'node:assert/strict';
import {
  randomUUID,
} from 'node:crypto';
import test, {
  after,
  afterEach,
} from 'node:test';

import postgres from 'postgres';

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL;

const testMigrationUrl =
  process.env.TEST_DATABASE_MIGRATION_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for begin-login service tests.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'TEST_DATABASE_MIGRATION_URL is required for begin-login service tests.',
  );
}

process.env.DATABASE_URL =
  testDatabaseUrl;

const throttleHmacKey =
  Buffer.alloc(
    32,
    7,
  );

process.env.ADMIN_AUTH_THROTTLE_HMAC_KEY =
  throttleHmacKey.toString(
    'base64url',
  );

const [
  {
    beginAdminLogin,
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
    ADMIN_LOGIN_CHALLENGE_TTL_MS,
  },
  {
    hashOpaqueAuthToken,
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
      '../../src/server/auth/hmac.ts'
    ),
    import(
      '../../src/server/auth/password.ts'
    ),
    import(
      '../../src/server/auth/service-contract.ts'
    ),
    import(
      '../../src/server/auth/tokens.ts'
    ),
  ]);

const adminSql =
  postgres(
    testMigrationUrl,
    {
      max: 2,
      prepare: false,
    },
  );

const ownedAdminIds =
  new Set();

const ownedThrottleHashes =
  new Set();

let ipSequence = 10;

function nextIp() {
  ipSequence += 1;

  return (
    `203.0.113.${ipSequence}`
  );
}

function uniqueEmail(
  label = 'admin',
) {
  return (
    `${label}.${randomUUID()}@example.test`
  ).toLowerCase();
}

function canonicalEmail(
  value,
) {
  return value
    .trim()
    .toLowerCase();
}

function rememberThrottleKeys(
  email,
  clientIp,
) {
  const account =
    hashAuthThrottleKey(
      'password_account',
      canonicalEmail(
        email,
      ),
      throttleHmacKey,
    );

  const ip =
    hashAuthThrottleKey(
      'password_ip',
      clientIp,
      throttleHmacKey,
    );

  ownedThrottleHashes.add(
    account,
  );

  ownedThrottleHashes.add(
    ip,
  );

  return {
    account,
    ip,
  };
}

async function createAdmin(
  options = {},
) {
  const email =
    options.email ??
    uniqueEmail();

  const password =
    options.password ??
    'Correct horse battery staple 123!';

  const isActive =
    options.isActive ??
    true;

  const now =
    options.now ??
    new Date(
      '2026-08-29T12:00:00.000Z',
    );

  const passwordHash =
    await hashPassword(
      password,
    );

  const rows =
    await adminSql`
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
        ${passwordHash},
        ${isActive},
        ${now},
        ${now},
        ${now}
      )
      returning
        id,
        email,
        password_hash,
        is_active,
        password_changed_at
    `;

  const row =
    rows[0];

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

    password,

    passwordHash:
      row.password_hash,

    isActive:
      row.is_active,

    passwordChangedAt:
      new Date(
        row.password_changed_at,
      ),
  };
}

async function insertTotpFactor(
  adminId,
  options = {},
) {
  const createdAt =
    options.createdAt ??
    new Date(
      '2026-08-29T12:00:00.000Z',
    );

  const confirmedAt =
    options.confirmedAt ??
    null;

  await adminSql`
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
      ${Buffer.from([1, 2, 3, 4])},
      ${Buffer.alloc(12, 5)},
      ${Buffer.alloc(16, 6)},
      1,
      null,
      ${confirmedAt},
      ${createdAt},
      ${createdAt}
    )
  `;
}

async function challengesForAdmin(
  adminId,
) {
  return adminSql`
    select
      id,
      admin_id,
      token_hash,
      type,
      attempt_count,
      expires_at,
      consumed_at,
      invalidated_at,
      created_at
    from admin_login_challenges
    where admin_id = ${adminId}
    order by
      created_at asc,
      id asc
  `;
}

async function countAdminSideEffects(
  adminId,
) {
  const rows =
    await adminSql`
      select
        (
          select count(*)::int
          from admin_sessions
          where admin_id = ${adminId}
        ) as sessions,
        (
          select count(*)::int
          from admin_recovery_codes
          where admin_id = ${adminId}
        ) as recovery_codes,
        (
          select count(*)::int
          from admin_totp_factors
          where admin_id = ${adminId}
        ) as totp_factors
    `;

  return rows[0];
}

async function seedThrottle(
  {
    scope,
    keyHash,
    failureCount,
    windowStartedAt,
    lastFailureAt,
    blockedUntil = null,
  },
) {
  ownedThrottleHashes.add(
    keyHash,
  );

  await adminSql`
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
      ${scope},
      ${keyHash},
      ${failureCount},
      ${windowStartedAt},
      ${lastFailureAt},
      ${blockedUntil},
      ${windowStartedAt},
      ${lastFailureAt ?? windowStartedAt}
    )
    on conflict (
      scope,
      key_hash
    )
    do update set
      failure_count =
        excluded.failure_count,
      window_started_at =
        excluded.window_started_at,
      last_failure_at =
        excluded.last_failure_at,
      blocked_until =
        excluded.blocked_until,
      updated_at =
        excluded.updated_at
  `;
}

async function throttleState(
  scope,
  keyHash,
) {
  const rows =
    await adminSql`
      select
        scope,
        key_hash,
        failure_count,
        window_started_at,
        last_failure_at,
        blocked_until
      from admin_auth_throttles
      where
        scope = ${scope}
        and
        key_hash = ${keyHash}
      limit 1
    `;

  return (
    rows[0] ??
    null
  );
}

async function cleanupOwnedRecords() {
  for (
    const adminId
    of ownedAdminIds
  ) {
    await adminSql`
      delete from admin_recovery_codes
      where admin_id = ${adminId}
    `;

    await adminSql`
      delete from admin_sessions
      where admin_id = ${adminId}
    `;

    await adminSql`
      delete from admin_login_challenges
      where admin_id = ${adminId}
    `;

    await adminSql`
      delete from admin_totp_factors
      where admin_id = ${adminId}
    `;

    await adminSql`
      delete from admins
      where id = ${adminId}
    `;
  }

  for (
    const keyHash
    of ownedThrottleHashes
  ) {
    await adminSql`
      delete from admin_auth_throttles
      where key_hash = ${keyHash}
    `;
  }

  ownedAdminIds.clear();
  ownedThrottleHashes.clear();
}

afterEach(
  async () => {
    await cleanupOwnedRecords();
  },
);

after(
  async () => {
    await cleanupOwnedRecords();

    await closeDatabase();

    await adminSql.end({
      timeout: 5,
    });
  },
);

test(
  'successful canonicalized password login creates one hash-only enrollment challenge with five-minute TTL',
  async () => {
    const now =
      new Date(
        '2026-08-29T12:30:00.000Z',
      );

    const admin =
      await createAdmin({
        now:
          new Date(
            '2026-08-29T12:00:00.000Z',
          ),
      });

    const clientIp =
      nextIp();

    const inputEmail =
      `  ${admin.email.toUpperCase()}  `;

    rememberThrottleKeys(
      inputEmail,
      clientIp,
    );

    const result =
      await beginAdminLogin({
        email:
          inputEmail,

        password:
          admin.password,

        clientIp,

        now,
      });

    assert.equal(
      result.ok,
      true,
    );

    if (!result.ok) {
      return;
    }

    assert.equal(
      result.next,
      'enrollment',
    );

    assert.match(
      result.challengeToken,
      /^[A-Za-z0-9_-]{43}$/u,
    );

    const challenges =
      await challengesForAdmin(
        admin.id,
      );

    assert.equal(
      challenges.length,
      1,
    );

    const challenge =
      challenges[0];

    assert.equal(
      challenge.type,
      'enrollment',
    );

    assert.equal(
      challenge.attempt_count,
      0,
    );

    assert.equal(
      challenge.token_hash,
      hashOpaqueAuthToken(
        result.challengeToken,
      ),
    );

    assert.notEqual(
      challenge.token_hash,
      result.challengeToken,
    );

    assert.equal(
      new Date(
        challenge.created_at,
      ).getTime(),
      now.getTime(),
    );

    assert.equal(
      new Date(
        challenge.expires_at,
      ).getTime() -
      new Date(
        challenge.created_at,
      ).getTime(),
      ADMIN_LOGIN_CHALLENGE_TTL_MS,
    );

    assert.equal(
      challenge.consumed_at,
      null,
    );

    assert.equal(
      challenge.invalidated_at,
      null,
    );

    const sideEffects =
      await countAdminSideEffects(
        admin.id,
      );

    assert.equal(
      sideEffects.sessions,
      0,
    );

    assert.equal(
      sideEffects.recovery_codes,
      0,
    );

    assert.equal(
      sideEffects.totp_factors,
      0,
    );
  },
);

test(
  'confirmed TOTP factor routes successful password login to an MFA challenge without creating a session',
  async () => {
    const now =
      new Date(
        '2026-08-29T13:00:00.000Z',
      );

    const admin =
      await createAdmin({
        now:
          new Date(
            '2026-08-29T12:00:00.000Z',
          ),
      });

    await insertTotpFactor(
      admin.id,
      {
        createdAt:
          new Date(
            '2026-08-29T12:05:00.000Z',
          ),

        confirmedAt:
          new Date(
            '2026-08-29T12:10:00.000Z',
          ),
      },
    );

    const clientIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      clientIp,
    );

    const result =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp,

        now,
      });

    assert.equal(
      result.ok,
      true,
    );

    if (!result.ok) {
      return;
    }

    assert.equal(
      result.next,
      'mfa',
    );

    const challenges =
      await challengesForAdmin(
        admin.id,
      );

    assert.equal(
      challenges.length,
      1,
    );

    assert.equal(
      challenges[0].type,
      'mfa',
    );

    const sideEffects =
      await countAdminSideEffects(
        admin.id,
      );

    assert.equal(
      sideEffects.sessions,
      0,
    );

    assert.equal(
      sideEffects.recovery_codes,
      0,
    );

    assert.equal(
      sideEffects.totp_factors,
      1,
    );
  },
);

test(
  'unconfirmed TOTP factor still routes password login to enrollment',
  async () => {
    const now =
      new Date(
        '2026-08-29T13:15:00.000Z',
      );

    const admin =
      await createAdmin();

    await insertTotpFactor(
      admin.id,
      {
        createdAt:
          new Date(
            '2026-08-29T12:10:00.000Z',
          ),

        confirmedAt:
          null,
      },
    );

    const clientIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      clientIp,
    );

    const result =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp,

        now,
      });

    assert.deepEqual(
      {
        ok:
          result.ok,

        next:
          result.ok
            ? result.next
            : null,
      },
      {
        ok: true,
        next: 'enrollment',
      },
    );
  },
);

test(
  'wrong-password and nonexistent-admin attempts are outwardly indistinguishable and create no challenge',
  async () => {
    const now =
      new Date(
        '2026-08-29T13:30:00.000Z',
      );

    const admin =
      await createAdmin();

    const wrongIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      wrongIp,
    );

    const wrongPasswordResult =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          'Definitely not the password',

        clientIp:
          wrongIp,

        now,
      });

    const missingEmail =
      uniqueEmail(
        'missing',
      );

    const missingIp =
      nextIp();

    rememberThrottleKeys(
      missingEmail,
      missingIp,
    );

    const missingResult =
      await beginAdminLogin({
        email:
          missingEmail,

        password:
          'Definitely not the password',

        clientIp:
          missingIp,

        now,
      });

    assert.deepEqual(
      wrongPasswordResult,
      {
        ok: false,
        reason:
          'invalid_credentials',
      },
    );

    assert.deepEqual(
      missingResult,
      wrongPasswordResult,
    );

    const challenges =
      await challengesForAdmin(
        admin.id,
      );

    assert.equal(
      challenges.length,
      0,
    );
  },
);

test(
  'disabled admin with the correct password fails as invalid credentials and receives no challenge',
  async () => {
    const now =
      new Date(
        '2026-08-29T13:45:00.000Z',
      );

    const admin =
      await createAdmin({
        isActive: false,
      });

    const clientIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      clientIp,
    );

    const result =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp,

        now,
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        reason:
          'invalid_credentials',
      },
    );

    assert.equal(
      (
        await challengesForAdmin(
          admin.id,
        )
      ).length,
      0,
    );
  },
);

test(
  'invalid email or invalid password input fails closed without creating a login challenge',
  async () => {
    const now =
      new Date(
        '2026-08-29T14:00:00.000Z',
      );

    const admin =
      await createAdmin();

    const emptyPasswordIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      emptyPasswordIp,
    );

    const emptyPasswordResult =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          '',

        clientIp:
          emptyPasswordIp,

        now,
      });

    assert.deepEqual(
      emptyPasswordResult,
      {
        ok: false,
        reason:
          'invalid_credentials',
      },
    );

    const oversizedPasswordIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      oversizedPasswordIp,
    );

    const oversizedPasswordResult =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          'x'.repeat(1_025),

        clientIp:
          oversizedPasswordIp,

        now,
      });

    assert.deepEqual(
      oversizedPasswordResult,
      {
        ok: false,
        reason:
          'invalid_credentials',
      },
    );

    assert.equal(
      (
        await challengesForAdmin(
          admin.id,
        )
      ).length,
      0,
    );
  },
);

test(
  'password-account throttle blocks on the fifth failure and later attempts do not increment it',
  async () => {
    const now =
      new Date(
        '2026-08-29T14:15:00.000Z',
      );

    const admin =
      await createAdmin();

    const clientIp =
      nextIp();

    const keys =
      rememberThrottleKeys(
        admin.email,
        clientIp,
      );

    await seedThrottle({
      scope:
        'password_account',

      keyHash:
        keys.account,

      failureCount:
        4,

      windowStartedAt:
        new Date(
          now.getTime() -
          60_000,
        ),

      lastFailureAt:
        new Date(
          now.getTime() -
          30_000,
        ),
    });

    const fifth =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          'wrong password',

        clientIp,

        now,
      });

    assert.deepEqual(
      fifth,
      {
        ok: false,
        reason:
          'invalid_credentials',
      },
    );

    const afterFifth =
      await throttleState(
        'password_account',
        keys.account,
      );

    assert.equal(
      afterFifth.failure_count,
      5,
    );

    assert.equal(
      new Date(
        afterFifth.blocked_until,
      ).getTime(),
      now.getTime() +
        15 * 60 * 1_000,
    );

    const sixth =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          'wrong password',

        clientIp,

        now:
          new Date(
            now.getTime() + 1,
          ),
      });

    assert.deepEqual(
      sixth,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    const afterSixth =
      await throttleState(
        'password_account',
        keys.account,
      );

    assert.equal(
      afterSixth.failure_count,
      5,
    );
  },
);

test(
  'password-IP throttle blocks on the twentieth failure and later attempts do not increment it',
  async () => {
    const now =
      new Date(
        '2026-08-29T14:30:00.000Z',
      );

    const admin =
      await createAdmin();

    const clientIp =
      nextIp();

    const keys =
      rememberThrottleKeys(
        admin.email,
        clientIp,
      );

    await seedThrottle({
      scope:
        'password_ip',

      keyHash:
        keys.ip,

      failureCount:
        19,

      windowStartedAt:
        new Date(
          now.getTime() -
          60_000,
        ),

      lastFailureAt:
        new Date(
          now.getTime() -
          30_000,
        ),
    });

    const twentieth =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          'wrong password',

        clientIp,

        now,
      });

    assert.deepEqual(
      twentieth,
      {
        ok: false,
        reason:
          'invalid_credentials',
      },
    );

    const state =
      await throttleState(
        'password_ip',
        keys.ip,
      );

    assert.equal(
      state.failure_count,
      20,
    );

    assert.equal(
      new Date(
        state.blocked_until,
      ).getTime(),
      now.getTime() +
        15 * 60 * 1_000,
    );

    const blockedAttempt =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          'wrong password',

        clientIp,

        now:
          new Date(
            now.getTime() + 1,
          ),
      });

    assert.deepEqual(
      blockedAttempt,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    const unchanged =
      await throttleState(
        'password_ip',
        keys.ip,
      );

    assert.equal(
      unchanged.failure_count,
      20,
    );
  },
);

test(
  'already-blocked password throttle prevents even correct credentials from creating a challenge',
  async () => {
    const now =
      new Date(
        '2026-08-29T14:45:00.000Z',
      );

    const admin =
      await createAdmin();

    const clientIp =
      nextIp();

    const keys =
      rememberThrottleKeys(
        admin.email,
        clientIp,
      );

    await seedThrottle({
      scope:
        'password_account',

      keyHash:
        keys.account,

      failureCount:
        5,

      windowStartedAt:
        new Date(
          now.getTime() -
          60_000,
        ),

      lastFailureAt:
        new Date(
          now.getTime() -
          30_000,
        ),

      blockedUntil:
        new Date(
          now.getTime() +
          5 * 60 * 1_000,
        ),
    });

    const result =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp,

        now,
      });

    assert.deepEqual(
      result,
      {
        ok: false,
        reason:
          'throttled',
      },
    );

    assert.equal(
      (
        await challengesForAdmin(
          admin.id,
        )
      ).length,
      0,
    );
  },
);

test(
  'a new successful password login invalidates the previous active challenge before inserting its replacement',
  async () => {
    const firstNow =
      new Date(
        '2026-08-29T15:00:00.000Z',
      );

    const secondNow =
      new Date(
        '2026-08-29T15:01:00.000Z',
      );

    const admin =
      await createAdmin();

    const firstIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      firstIp,
    );

    const first =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp:
          firstIp,

        now:
          firstNow,
      });

    assert.equal(
      first.ok,
      true,
    );

    const secondIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      secondIp,
    );

    const second =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp:
          secondIp,

        now:
          secondNow,
      });

    assert.equal(
      second.ok,
      true,
    );

    const rows =
      await challengesForAdmin(
        admin.id,
      );

    assert.equal(
      rows.length,
      2,
    );

    assert.equal(
      new Date(
        rows[0].invalidated_at,
      ).getTime(),
      secondNow.getTime(),
    );

    assert.equal(
      rows[0].consumed_at,
      null,
    );

    assert.equal(
      rows[1].invalidated_at,
      null,
    );

    assert.equal(
      rows[1].consumed_at,
      null,
    );

    if (
      first.ok &&
      second.ok
    ) {
      assert.notEqual(
        hashOpaqueAuthToken(
          first.challengeToken,
        ),
        hashOpaqueAuthToken(
          second.challengeToken,
        ),
      );
    }
  },
);

test(
  'successful password login explicitly resets existing account and IP throttle state',
  async () => {
    const now =
      new Date(
        '2026-08-29T15:15:00.000Z',
      );

    const admin =
      await createAdmin();

    const clientIp =
      nextIp();

    const keys =
      rememberThrottleKeys(
        admin.email,
        clientIp,
      );

    const windowStartedAt =
      new Date(
        now.getTime() -
        2 * 60 * 1_000,
      );

    const lastFailureAt =
      new Date(
        now.getTime() -
        60_000,
      );

    await seedThrottle({
      scope:
        'password_account',

      keyHash:
        keys.account,

      failureCount:
        3,

      windowStartedAt,

      lastFailureAt,
    });

    await seedThrottle({
      scope:
        'password_ip',

      keyHash:
        keys.ip,

      failureCount:
        7,

      windowStartedAt,

      lastFailureAt,
    });

    const result =
      await beginAdminLogin({
        email:
          admin.email,

        password:
          admin.password,

        clientIp,

        now,
      });

    assert.equal(
      result.ok,
      true,
    );

    const accountState =
      await throttleState(
        'password_account',
        keys.account,
      );

    const ipState =
      await throttleState(
        'password_ip',
        keys.ip,
      );

    for (
      const state
      of [
        accountState,
        ipState,
      ]
    ) {
      assert.equal(
        state.failure_count,
        0,
      );

      assert.equal(
        state.last_failure_at,
        null,
      );

      assert.equal(
        state.blocked_until,
        null,
      );

      assert.equal(
        new Date(
          state.window_started_at,
        ).getTime(),
        now.getTime(),
      );
    }
  },
);

test(
  'password_changed_at race after credential verification fails closed and creates no challenge',
  async () => {
    const initialTime =
      new Date(
        '2026-08-29T15:30:00.000Z',
      );

    const loginTime =
      new Date(
        '2026-08-29T15:40:00.000Z',
      );

    const admin =
      await createAdmin({
        now:
          initialTime,
      });

    const clientIp =
      nextIp();

    rememberThrottleKeys(
      admin.email,
      clientIp,
    );

    const lockSql =
      await adminSql.reserve();

    let committed =
      false;

    try {
      await lockSql`
        begin
      `;

      await lockSql`
        select id
        from admins
        where id = ${admin.id}
        for update
      `;

      const loginPromise =
        beginAdminLogin({
          email:
            admin.email,

          password:
            admin.password,

          clientIp,

          now:
            loginTime,
        });

      await new Promise(
        (resolve) => {
          setTimeout(
            resolve,
            150,
          );
        },
      );

      const changedAt =
        new Date(
          loginTime.getTime() -
          1_000,
        );

      await lockSql`
        update admins
        set
          password_changed_at =
            ${changedAt},
          updated_at =
            ${changedAt}
        where id = ${admin.id}
      `;

      await lockSql`
        commit
      `;

      committed =
        true;

      const result =
        await loginPromise;

      assert.deepEqual(
        result,
        {
          ok: false,
          reason:
            'invalid_credentials',
        },
      );

      assert.equal(
        (
          await challengesForAdmin(
            admin.id,
          )
        ).length,
        0,
      );
    } finally {
      if (!committed) {
        try {
          await lockSql`
            rollback
          `;
        } catch {
          // Preserve original test failure.
        }
      }

      lockSql.release();
    }
  },
);
