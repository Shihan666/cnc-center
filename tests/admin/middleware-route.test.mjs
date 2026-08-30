import assert from 'node:assert/strict';
import test from 'node:test';

import {
  onRequest,
} from '../../src/middleware.ts';

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
  const deleteCalls = [];

  return {
    getCalls,
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
  pathname,
  cookies =
    createStrictCookies(),
  site =
    new URL(
      'http://localhost:4321',
    ),
  authorization =
    null,
} = {}) {
  const headers =
    new Headers();

  if (
    authorization !== null
  ) {
    headers.set(
      'authorization',
      authorization,
    );
  }

  return {
    url:
      new URL(
        `http://localhost:4321${pathname}`,
      ),

    request:
      new Request(
        `http://localhost:4321${pathname}`,
        {
          headers,
        },
      ),

    cookies,
    site,
    locals: {},

    redirect(
      path,
      status = 302,
    ) {
      return new Response(
        null,
        {
          status,

          headers: {
            Location:
              path,
          },
        },
      );
    },
  };
}

test(
  'non-admin requests bypass admin cookie and auth work unchanged',
  async () => {
    const downstream =
      new Response(
        'public',
        {
          status: 200,

          headers: {
            'Cache-Control':
              'public, max-age=60',
          },
        },
      );

    let nextCalls = 0;

    const response =
      await onRequest(
        createContext({
          pathname:
            '/products',
        }),
        async () => {
          nextCalls += 1;
          return downstream;
        },
      );

    assert.equal(
      nextCalls,
      1,
    );

    assert.equal(
      response,
      downstream,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'public, max-age=60',
    );

    assert.equal(
      response.headers.get(
        'x-robots-tag',
      ),
      null,
    );
  },
);

test(
  'admin auth entry requests require no session and force private no-store',
  async () => {
    let nextCalls = 0;

    const response =
      await onRequest(
        createContext({
          pathname:
            '/admin/auth/login',
        }),
        async () => {
          nextCalls += 1;

          return new Response(
            'login',
            {
              status: 200,
            },
          );
        },
      );

    assert.equal(
      nextCalls,
      1,
    );

    assert.equal(
      response.status,
      200,
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'private, no-store',
    );

    assert.equal(
      response.headers.get(
        'x-robots-tag',
      ),
      'noindex, nofollow',
    );
  },
);

test(
  'protected admin request without session clears only the session cookie and redirects to fixed login path',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    let nextCalls = 0;

    const response =
      await onRequest(
        createContext({
          pathname:
            '/admin/orders',

          cookies:
            recorder.cookies,
        }),
        async () => {
          nextCalls += 1;

          return new Response(
            'must-not-run',
          );
        },
      );

    assert.equal(
      nextCalls,
      0,
    );

    assert.deepEqual(
      recorder.getCalls,
      [
        'cnc_admin_session',
      ],
    );

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
      response.status,
      302,
    );

    assert.equal(
      response.headers.get(
        'location',
      ),
      '/admin/auth/login',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'private, no-store',
    );

    assert.equal(
      response.headers.get(
        'x-robots-tag',
      ),
      'noindex, nofollow',
    );
  },
);

test(
  'protected admin ignores query and Authorization credentials when session cookie is absent',
  async () => {
    const recorder =
      createMissingSessionRecorder();

    const response =
      await onRequest(
        createContext({
          pathname:
            '/admin?sessionToken=must-not-be-used',

          authorization:
            'Bearer must-not-be-used',

          cookies:
            recorder.cookies,
        }),
        async () =>
          new Response(
            'must-not-run',
          ),
      );

    assert.deepEqual(
      recorder.getCalls,
      [
        'cnc_admin_session',
      ],
    );

    assert.equal(
      response.status,
      302,
    );

    assert.equal(
      response.headers.get(
        'location',
      ),
      '/admin/auth/login',
    );
  },
);

test(
  'protected admin fails closed with generic 500 before cookie access when site configuration is missing',
  async () => {
    const response =
      await onRequest(
        createContext({
          pathname:
            '/admin',

          site:
            null,

          cookies:
            createStrictCookies(),
        }),
        async () =>
          new Response(
            'must-not-run',
          ),
      );

    assert.equal(
      response.status,
      500,
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'text/plain; charset=utf-8',
    );

    assert.equal(
      response.headers.get(
        'cache-control',
      ),
      'private, no-store',
    );

    assert.equal(
      response.headers.get(
        'x-robots-tag',
      ),
      'noindex, nofollow',
    );

    assert.equal(
      await response.text(),
      'Internal Server Error',
    );
  },
);
