import assert from 'node:assert/strict';
import test from 'node:test';

const {
  POST,
} =
  await import(
    '../../src/pages/api/admin/auth/totp.ts'
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

function createMissingChallengeRecorder() {
  const setCalls = [];
  const deleteCalls = [];

  return {
    setCalls,
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        assert.equal(
          name,
          'cnc_admin_challenge',
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
    JSON.stringify({
      totpToken:
        '123456',
    }),
  site =
    new URL(
      'http://localhost:4321',
    ),
  cookies =
    createStrictCookies(),
  clientAddress =
    '127.0.0.1',
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
        'http://localhost:4321/api/admin/auth/totp',
        {
          method: 'POST',
          headers,
          body,
        },
      ),

    cookies,
    site,
    clientAddress,
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
  'ordinary TOTP MFA rejects cross-origin requests before cookie or service work',
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
  'ordinary TOTP MFA rejects a missing Origin header',
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
  'ordinary TOTP MFA rejects unsupported media types',
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
  'ordinary TOTP MFA accepts only a JSON object with exactly one string totpToken',
  async () => {
    const invalidBodies = [
      '{',
      'null',
      '[]',
      '"123456"',
      '{}',
      JSON.stringify({
        totpToken:
          123456,
      }),
      JSON.stringify({
        totpToken:
          '123456',
        extra:
          true,
      }),
      JSON.stringify({
        challengeToken:
          'must-not-come-from-json',
      }),
      JSON.stringify({
        recoveryCode:
          'must-not-be-accepted-here',
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
  'ordinary TOTP MFA maps a missing challenge cookie to 401 clears only the challenge cookie and creates no session cookie',
  async () => {
    const recorder =
      createMissingChallengeRecorder();

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
  },
);

test(
  'ordinary TOTP MFA fails closed with a generic server error when Astro site configuration is missing',
  async () => {
    const response =
      await POST(
        createContext({
          site:
            null,
        }),
      );

    await assertJsonFailure(
      response,
      500,
      'server_error',
    );
  },
);