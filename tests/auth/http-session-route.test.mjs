import assert from 'node:assert/strict';
import test from 'node:test';

const {
  GET,
} =
  await import(
    '../../src/pages/api/admin/auth/session.ts'
  );

function createStrictCookies() {
  return {
    get() {
      throw new Error(
        'Unexpected cookie read.',
      );
    },

    set() {
      throw new Error(
        'Unexpected cookie set.',
      );
    },

    delete() {
      throw new Error(
        'Unexpected cookie delete.',
      );
    },
  };
}

function createMissingSessionRecorder() {
  const getCalls = [];
  const setCalls = [];
  const deleteCalls = [];

  return {
    getCalls,
    setCalls,
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        getCalls.push(
          name,
        );

        assert.equal(
          name,
          'cnc_admin_session',
        );

        return undefined;
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

function createContext({
  url =
    'http://localhost:4321/api/admin/auth/session',
  origin =
    null,
  authorization =
    null,
  contentType =
    null,
  site =
    new URL(
      'http://localhost:4321',
    ),
  cookies =
    createStrictCookies(),
} = {}) {
  const headers =
    new Headers();

  if (origin !== null) {
    headers.set(
      'origin',
      origin,
    );
  }

  if (authorization !== null) {
    headers.set(
      'authorization',
      authorization,
    );
  }

  if (contentType !== null) {
    headers.set(
      'content-type',
      contentType,
    );
  }

  return {
    request:
      new Request(
        url,
        {
          method: 'GET',
          headers,
        },
      ),

    cookies,
    site,
  };
}

async function assertInvalidSession(
  response,
) {
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

  assert.equal(
    response.headers.get(
      'content-type',
    ),
    'application/json; charset=utf-8',
  );

  assert.deepEqual(
    await response.json(),
    {
      ok: false,
      reason: 'invalid_session',
    },
  );
}

function assertSessionCookieDeleted(
  recorder,
) {
  assert.deepEqual(
    recorder.deleteCalls,
    [
      {
        name:
          'cnc_admin_session',

        options: {
          httpOnly: true,
          sameSite: 'strict',
          secure: false,
          path: '/',
        },
      },
    ],
  );

  assert.equal(
    recorder.setCalls.length,
    0,
  );
}
test(
  'admin session GET maps a missing session cookie to 401 and clears only the session credential',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    const response =
      await GET(
        createContext({
          cookies:
            recorder.cookies,
        }),
      );

    await assertInvalidSession(
      response,
    );

    assert.deepEqual(
      recorder.getCalls,
      [
        'cnc_admin_session',
      ],
    );

    assertSessionCookieDeleted(
      recorder,
    );
  },
);

test(
  'admin session GET does not apply POST-style Origin rejection',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    const response =
      await GET(
        createContext({
          origin:
            'https://evil.example.test',

          cookies:
            recorder.cookies,
        }),
      );

    await assertInvalidSession(
      response,
    );

    assertSessionCookieDeleted(
      recorder,
    );
  },
);

test(
  'admin session GET ignores query and Authorization credentials when the HttpOnly session cookie is absent',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    const response =
      await GET(
        createContext({
          url:
            'http://localhost:4321/api/admin/auth/session?sessionToken=must-not-be-used',

          authorization:
            'Bearer must-not-be-used',

          cookies:
            recorder.cookies,
        }),
      );

    await assertInvalidSession(
      response,
    );

    assert.deepEqual(
      recorder.getCalls,
      [
        'cnc_admin_session',
      ],
    );

    assertSessionCookieDeleted(
      recorder,
    );
  },
);

test(
  'admin session GET does not require or parse a JSON content type',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    const response =
      await GET(
        createContext({
          contentType:
            'text/plain',

          cookies:
            recorder.cookies,
        }),
      );

    await assertInvalidSession(
      response,
    );

    assertSessionCookieDeleted(
      recorder,
    );
  },
);

test(
  'admin session GET fails closed with generic 500 before cookie access when Astro site configuration is missing',
  async () => {
    const response =
      await GET(
        createContext({
          site:
            null,

          cookies:
            createStrictCookies(),
        }),
      );

    assert.equal(
      response.status,
      500,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'no-store',
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
    );

    assert.deepEqual(
      await response.json(),
      {
        ok: false,
        reason: 'server_error',
      },
    );
  },
);