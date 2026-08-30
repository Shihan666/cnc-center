import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_AUTH_API_PREFIX,
  ADMIN_CHALLENGE_COOKIE_MAX_AGE_SECONDS,
  ADMIN_CHALLENGE_COOKIE_NAME,
  ADMIN_CHALLENGE_COOKIE_PATH,
  ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_PATH,
  getAdminChallengeCookieDeleteOptions,
  getAdminChallengeCookieOptions,
  getAdminSessionCookieDeleteOptions,
  getAdminSessionCookieOptions,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
  createAdminAuthJsonResponse,
} from '../../src/server/auth/http.ts';

test(
  'HTTP auth constants match the locked route and cookie contract',
  () => {
    assert.equal(
      ADMIN_AUTH_API_PREFIX,
      '/api/admin/auth',
    );

    assert.equal(
      ADMIN_CHALLENGE_COOKIE_NAME,
      'cnc_admin_challenge',
    );

    assert.equal(
      ADMIN_SESSION_COOKIE_NAME,
      'cnc_admin_session',
    );

    assert.equal(
      ADMIN_CHALLENGE_COOKIE_PATH,
      '/api/admin/auth',
    );

    assert.equal(
      ADMIN_SESSION_COOKIE_PATH,
      '/',
    );

    assert.equal(
      ADMIN_CHALLENGE_COOKIE_MAX_AGE_SECONDS,
      300,
    );

    assert.equal(
      ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS,
      28_800,
    );
  },
);

test(
  'same-origin guard accepts only an exact canonical Origin header',
  () => {
    const siteOrigin =
      'http://localhost:4321';

    const request =
      new Request(
        'http://localhost:4321/api/admin/auth/login',
        {
          method: 'POST',
          headers: {
            origin:
              'http://localhost:4321',
          },
        },
      );

    assert.equal(
      isSameAdminAuthOrigin(
        request,
        siteOrigin,
      ),
      true,
    );
  },
);

test(
  'same-origin guard rejects missing null malformed and cross-origin headers',
  () => {
    const siteOrigin =
      'https://admin.example.test';

    const cases = [
      undefined,
      'null',
      'not a url',
      'https://evil.example.test',
      'https://admin.example.test/',
    ];

    for (const origin of cases) {
      const headers =
        new Headers();

      if (origin !== undefined) {
        headers.set(
          'origin',
          origin,
        );
      }

      const request =
        new Request(
          'https://admin.example.test/api/admin/auth/login',
          {
            method: 'POST',
            headers,
          },
        );

      assert.equal(
        isSameAdminAuthOrigin(
          request,
          siteOrigin,
        ),
        false,
      );
    }
  },
);
test(
  'admin auth origin configuration must itself be a canonical HTTP or HTTPS origin',
  () => {
    const request =
      new Request(
        'https://admin.example.test/api/admin/auth/login',
        {
          method: 'POST',
          headers: {
            origin:
              'https://admin.example.test',
          },
        },
      );

    const invalidSiteOrigins = [
      '',
      '   ',
      'not a url',
      'ftp://admin.example.test',
      'https://admin.example.test/',
      'https://admin.example.test/path',
      'https://admin.example.test?x=1',
      'https://admin.example.test#fragment',
    ];

    for (
      const siteOrigin of
      invalidSiteOrigins
    ) {
      assert.throws(
        () =>
          isSameAdminAuthOrigin(
            request,
            siteOrigin,
          ),
      );
    }
  },
);

test(
  'challenge cookie uses strict HttpOnly five-minute policy and is insecure only for HTTP development',
  () => {
    assert.deepEqual(
      getAdminChallengeCookieOptions(
        'http://localhost:4321',
      ),
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/api/admin/auth',
        maxAge: 300,
      },
    );

    assert.deepEqual(
      getAdminChallengeCookieOptions(
        'https://admin.example.test',
      ),
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/api/admin/auth',
        maxAge: 300,
      },
    );
  },
);

test(
  'session cookie uses strict HttpOnly eight-hour policy and root path',
  () => {
    assert.deepEqual(
      getAdminSessionCookieOptions(
        'http://localhost:4321',
      ),
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/',
        maxAge: 28_800,
      },
    );

    assert.deepEqual(
      getAdminSessionCookieOptions(
        'https://admin.example.test',
      ),
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/',
        maxAge: 28_800,
      },
    );
  },
);

test(
  'cookie deletion mirrors security and path policy without lifetime fields',
  () => {
    assert.deepEqual(
      getAdminChallengeCookieDeleteOptions(
        'https://admin.example.test',
      ),
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/api/admin/auth',
      },
    );

    assert.deepEqual(
      getAdminSessionCookieDeleteOptions(
        'https://admin.example.test',
      ),
      {
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/',
      },
    );
  },
);
test(
  'JSON request guard accepts only application/json media type with optional parameters',
  () => {
    const accepted = [
      'application/json',
      'application/json; charset=utf-8',
      'Application/JSON; Charset=UTF-8',
    ];

    for (
      const contentType of accepted
    ) {
      const request =
        new Request(
          'https://admin.example.test/api/admin/auth/login',
          {
            method: 'POST',
            headers: {
              'content-type':
                contentType,
            },
          },
        );

      assert.equal(
        isAdminAuthJsonRequest(
          request,
        ),
        true,
      );
    }
  },
);

test(
  'JSON request guard rejects missing and non-application-json media types',
  () => {
    const rejected = [
      undefined,
      'text/plain',
      'application/x-www-form-urlencoded',
      'application/problem+json',
      'multipart/form-data',
    ];

    for (
      const contentType of rejected
    ) {
      const headers =
        new Headers();

      if (
        contentType !== undefined
      ) {
        headers.set(
          'content-type',
          contentType,
        );
      }

      const request =
        new Request(
          'https://admin.example.test/api/admin/auth/login',
          {
            method: 'POST',
            headers,
          },
        );

      assert.equal(
        isAdminAuthJsonRequest(
          request,
        ),
        false,
      );
    }
  },
);

test(
  'JSON object reader accepts only a parsed non-array object and fails closed',
  async () => {
    const validRequest =
      new Request(
        'https://admin.example.test/api/admin/auth/login',
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json',
          },
          body:
            JSON.stringify({
              email:
                'admin@example.test',
            }),
        },
      );

    assert.deepEqual(
      await readAdminAuthJsonObject(
        validRequest,
      ),
      {
        email:
          'admin@example.test',
      },
    );

    const invalidBodies = [
      '{',
      'null',
      '[]',
      '"value"',
      '42',
    ];

    for (
      const body of invalidBodies
    ) {
      const request =
        new Request(
          'https://admin.example.test/api/admin/auth/login',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json',
            },
            body,
          },
        );

      assert.equal(
        await readAdminAuthJsonObject(
          request,
        ),
        null,
      );
    }
  },
);

test(
  'admin auth JSON response is no-store and preserves explicit status',
  async () => {
    const response =
      createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            'invalid_request',
        },
        400,
      );

    assert.equal(
      response.status,
      400,
    );

    assert.equal(
      response.headers.get(
        'content-type',
      ),
      'application/json; charset=utf-8',
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
          'invalid_request',
      },
    );
  },
);