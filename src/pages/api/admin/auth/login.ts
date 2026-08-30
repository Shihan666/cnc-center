import type {
  APIContext,
  APIRoute,
} from 'astro';

import {
  getAdminChallengeCookieDeleteOptions,
  getAdminChallengeCookieOptions,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
  createAdminAuthJsonResponse,
  ADMIN_CHALLENGE_COOKIE_NAME,
} from '../../../../server/auth/http.ts';

import {
  beginAdminLogin,
} from '../../../../server/auth/service.ts';

function invalidRequestResponse(): Response {
  return createAdminAuthJsonResponse(
    {
      ok: false,
      reason: 'invalid_request',
    },
    400,
  );
}

function getLoginInput(
  body: Record<string, unknown>,
): {
  email: string;
  password: string;
} | null {
  if (
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return null;
  }

  return {
    email: body.email,
    password: body.password,
  };
}

async function handleLogin(
  context: APIContext,
): Promise<Response> {
  const {
    request,
    cookies,
    site,
  } = context;

  if (!site) {
    throw new Error(
      'Astro site configuration is required for admin authentication.',
    );
  }

  const siteOrigin =
    site.origin;

  if (
    !isSameAdminAuthOrigin(
      request,
      siteOrigin,
    )
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason: 'forbidden',
      },
      403,
    );
  }

  if (
    !isAdminAuthJsonRequest(
      request,
    )
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'unsupported_media_type',
      },
      415,
    );
  }

  const body =
    await readAdminAuthJsonObject(
      request,
    );

  if (!body) {
    return invalidRequestResponse();
  }

  const loginInput =
    getLoginInput(
      body,
    );

  if (!loginInput) {
    return invalidRequestResponse();
  }

  const result =
    await beginAdminLogin({
      email:
        loginInput.email,

      password:
        loginInput.password,

      clientIp:
        context.clientAddress,

      now:
        new Date(),
    });

  if (!result.ok) {
    cookies.delete(
      ADMIN_CHALLENGE_COOKIE_NAME,
      getAdminChallengeCookieDeleteOptions(
        siteOrigin,
      ),
    );

    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          result.reason,
      },
      result.reason === 'throttled'
        ? 429
        : 401,
    );
  }

  cookies.set(
    ADMIN_CHALLENGE_COOKIE_NAME,
    result.challengeToken,
    getAdminChallengeCookieOptions(
      siteOrigin,
    ),
  );

  return createAdminAuthJsonResponse(
    {
      ok: true,
      next:
        result.next,
    },
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleLogin(
        context,
      );
    } catch {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason: 'server_error',
        },
        500,
      );
    }
  };