import assert from 'node:assert/strict';
import test from 'node:test';

const {
  POST,
} =
  await import(
    '../../src/pages/api/admin/auth/login.ts'
  );

function createCookiesGuard() {
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

function createContext({
  origin =
    'http://localhost:4321',
  contentType =
    'application/json',
  body =
    JSON.stringify({
      email:
        'admin@example.test',
      password:
        'test-password',
    }),
  site =
    new URL(
      'http://localhost:4321',
    ),
} = {}) {
  const headers =
    new Headers();

  if (origin !== null) {
    headers.set(
      'origin',
      origin,
    );
  }

  if (contentType !== undefined) {
    headers.set(
      'content-type',
      contentType,
    );
  }

  return {
    request:
      new Request(
        'http://localhost:4321/api/admin/auth/login',
        {
          method: 'POST',
          headers,
          body,
        },
      ),

    cookies:
      createCookiesGuard(),

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
  'login route rejects cross-origin requests before authentication work',
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
  'login route rejects a missing Origin header',
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
  'login route rejects unsupported request media types',
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
  'login route rejects malformed and structurally invalid JSON bodies',
  async () => {
    const invalidBodies = [
      '{',
      'null',
      '[]',
      JSON.stringify({}),
      JSON.stringify({
        email:
          'admin@example.test',
      }),
      JSON.stringify({
        password:
          'test-password',
      }),
      JSON.stringify({
        email: 123,
        password:
          'test-password',
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
  'login route fails closed with a generic server error when Astro site configuration is missing',
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