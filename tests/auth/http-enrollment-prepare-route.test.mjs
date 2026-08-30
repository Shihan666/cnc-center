import assert from 'node:assert/strict';
import test from 'node:test';

const {
  POST,
} =
  await import(
    '../../src/pages/api/admin/auth/enrollment/prepare.ts'
  );

function createStrictCookieGuard() {
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

function createMissingChallengeCookies() {
  const deleteCalls = [];

  return {
    deleteCalls,

    cookies: {
      get() {
        return undefined;
      },

      set() {
        throw new Error(
          'Unexpected cookie set.',
        );
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
    createStrictCookieGuard(),
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

  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/enrollment/prepare',
        {
          method: 'POST',
          headers,
          body,
        },
      ),

    cookies,

    site,

    clientAddress:
      '127.0.0.1',
  };
}

async function assertJsonFailure(
  response,
  status,
  reason,
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
    {
      ok: false,
      reason,
    },
  );
}
test(
  'enrollment prepare rejects cross-origin requests before cookie or service work',
  async () => {
    const response =
      await POST(
        createContext({
          origin:
            'https://evil.example.test',
        }),
      );

    await assertJsonFailure(
      response,
      403,
      'forbidden',
    );
  },
);

test(
  'enrollment prepare rejects a missing Origin header',
  async () => {
    const response =
      await POST(
        createContext({
          origin:
            null,
        }),
      );

    await assertJsonFailure(
      response,
      403,
      'forbidden',
    );
  },
);

test(
  'enrollment prepare rejects unsupported media types',
  async () => {
    const response =
      await POST(
        createContext({
          contentType:
            'text/plain',
        }),
      );

    await assertJsonFailure(
      response,
      415,
      'unsupported_media_type',
    );
  },
);

test(
  'enrollment prepare accepts only an empty JSON object body',
  async () => {
    const invalidBodies = [
      '{',
      'null',
      '[]',
      '"value"',
      JSON.stringify({
        challengeToken:
          'must-not-come-from-json',
      }),
      JSON.stringify({
        extra: true,
      }),
    ];

    for (
      const body of invalidBodies
    ) {
      const response =
        await POST(
          createContext({
            body,
          }),
        );

      await assertJsonFailure(
        response,
        400,
        'invalid_request',
      );
    }
  },
);
test(
  'enrollment prepare maps a missing challenge cookie to 401 and clears the cookie',
  async () => {
    const recorder =
      createMissingChallengeCookies();

    const response =
      await POST(
        createContext({
          cookies:
            recorder.cookies,
        }),
      );

    await assertJsonFailure(
      response,
      401,
      'invalid_challenge',
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
  },
);

test(
  'enrollment prepare fails closed with a generic server error when Astro site configuration is missing',
  async () => {
    const response =
      await POST(
        createContext({
          site:
            undefined,
        }),
      );

    await assertJsonFailure(
      response,
      500,
      'server_error',
    );
  },
);