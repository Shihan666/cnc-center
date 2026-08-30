import assert from 'node:assert/strict';
import test from 'node:test';

const {
  POST,
} =
  await import(
    '../../src/pages/api/admin/auth/logout.ts'
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
  origin =
    'http://localhost:4321',
  contentType =
    'application/json',
  body =
    '{}',
  site =
    new URL(
      'http://localhost:4321',
    ),
  cookies =
    createStrictCookies(),
  url =
    'http://localhost:4321/api/admin/auth/logout',
  authorization =
    null,
} = {}) {
  const headers =
    new Headers();

  if (origin !== null) {
    headers.set(
      'origin',
      origin,
    );
  }

  if (contentType !== null) {
    headers.set(
      'content-type',
      contentType,
    );
  }

  if (authorization !== null) {
    headers.set(
      'authorization',
      authorization,
    );
  }

  return {
    request:
      new Request(
        url,
        {
          method: 'POST',
          headers,
          body,
        },
      ),

    cookies,
    site,
  };
}

async function assertJsonResponse(
  response,
  status,
  body,
) {
  assert.equal(
    response.status,
    status,
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
    body,
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
  'admin logout fails closed with generic 500 before cookie access when Astro site configuration is missing',
  async () => {
    const response =
      await POST(
        createContext({
          site:
            null,

          cookies:
            createStrictCookies(),
        }),
      );

    await assertJsonResponse(
      response,
      500,
      {
        ok: false,
        reason: 'server_error',
      },
    );
  },
);

test(
  'admin logout rejects a missing Origin before cookie access',
  async () => {
    const response =
      await POST(
        createContext({
          origin:
            null,

          cookies:
            createStrictCookies(),
        }),
      );

    await assertJsonResponse(
      response,
      403,
      {
        ok: false,
        reason: 'forbidden',
      },
    );
  },
);

test(
  'admin logout rejects a cross-origin request before cookie access',
  async () => {
    const response =
      await POST(
        createContext({
          origin:
            'https://evil.example.test',

          cookies:
            createStrictCookies(),
        }),
      );

    await assertJsonResponse(
      response,
      403,
      {
        ok: false,
        reason: 'forbidden',
      },
    );
  },
);

test(
  'admin logout rejects unsupported media type before cookie access',
  async () => {
    const response =
      await POST(
        createContext({
          contentType:
            'text/plain',

          cookies:
            createStrictCookies(),
        }),
      );

    await assertJsonResponse(
      response,
      415,
      {
        ok: false,
        reason:
          'unsupported_media_type',
      },
    );
  },
);

test(
  'admin logout rejects malformed JSON before cookie access',
  async () => {
    const response =
      await POST(
        createContext({
          body:
            '{"broken":',

          cookies:
            createStrictCookies(),
        }),
      );

    await assertJsonResponse(
      response,
      400,
      {
        ok: false,
        reason: 'invalid_request',
      },
    );
  },
);

test(
  'admin logout rejects a non-empty JSON object before cookie access',
  async () => {
    const response =
      await POST(
        createContext({
          body:
            JSON.stringify({
              sessionToken:
                'must-not-be-accepted',
            }),

          cookies:
            createStrictCookies(),
        }),
      );

    await assertJsonResponse(
      response,
      400,
      {
        ok: false,
        reason: 'invalid_request',
      },
    );
  },
);

test(
  'admin logout is idempotently successful without a session cookie and clears only the session credential',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    const response =
      await POST(
        createContext({
          url:
            'http://localhost:4321/api/admin/auth/logout?sessionToken=must-not-be-used',

          authorization:
            'Bearer must-not-be-used',

          cookies:
            recorder.cookies,
        }),
      );

    await assertJsonResponse(
      response,
      200,
      {
        ok: true,
      },
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