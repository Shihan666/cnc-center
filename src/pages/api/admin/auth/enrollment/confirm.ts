import type {
  APIContext,
  APIRoute,
} from 'astro';

import {
  ADMIN_CHALLENGE_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  createAdminAuthJsonResponse,
  getAdminChallengeCookieDeleteOptions,
  getAdminSessionCookieOptions,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../../../../server/auth/http.ts';

import {
  confirmAdminTotpEnrollment,
} from '../../../../../server/auth/service.ts';

function invalidRequestResponse(): Response {
  return createAdminAuthJsonResponse(
    {
      ok: false,
      reason: 'invalid_request',
    },
    400,
  );
}

function deleteChallengeCookie(
  context: APIContext,
  siteOrigin: string,
): void {
  context.cookies.delete(
    ADMIN_CHALLENGE_COOKIE_NAME,
    getAdminChallengeCookieDeleteOptions(
      siteOrigin,
    ),
  );
}

async function handleConfirmEnrollment(
  context: APIContext,
): Promise<Response> {
  const {
    request,
    cookies,
    site,
    clientAddress,
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

  if (
    !body ||
    Object.keys(body).length !== 1 ||
    typeof body.totpToken !==
      'string'
  ) {
    return invalidRequestResponse();
  }

  const challengeToken =
    cookies.get(
      ADMIN_CHALLENGE_COOKIE_NAME,
    )?.value;

  if (!challengeToken) {
    deleteChallengeCookie(
      context,
      siteOrigin,
    );

    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_challenge',
      },
      401,
    );
  }

  const result =
    await confirmAdminTotpEnrollment({
      challengeToken,

      totpToken:
        body.totpToken,

      clientIp:
        clientAddress,

      now:
        new Date(),
    });

  if (!result.ok) {
    if (
      result.reason ===
      'invalid_challenge'
    ) {
      deleteChallengeCookie(
        context,
        siteOrigin,
      );
    }

    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          result.reason,
      },
      result.reason ===
        'throttled'
        ? 429
        : 401,
    );
  }

  cookies.set(
    ADMIN_SESSION_COOKIE_NAME,
    result.sessionToken,
    getAdminSessionCookieOptions(
      siteOrigin,
    ),
  );

  deleteChallengeCookie(
    context,
    siteOrigin,
  );

  return createAdminAuthJsonResponse(
    {
      ok: true,

      admin:
        result.admin,

      recoveryCodes:
        result.recoveryCodes,
    },
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleConfirmEnrollment(
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