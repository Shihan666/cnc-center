import type {
  APIContext,
  APIRoute,
} from 'astro';

import {
  ADMIN_CHALLENGE_COOKIE_NAME,
  createAdminAuthJsonResponse,
  getAdminChallengeCookieDeleteOptions,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../../../../server/auth/http.ts';

import {
  prepareAdminTotpEnrollment,
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

function invalidChallengeResponse(
  context: APIContext,
  siteOrigin: string,
): Response {
  context.cookies.delete(
    ADMIN_CHALLENGE_COOKIE_NAME,
    getAdminChallengeCookieDeleteOptions(
      siteOrigin,
    ),
  );

  return createAdminAuthJsonResponse(
    {
      ok: false,
      reason: 'invalid_challenge',
    },
    401,
  );
}

async function handlePrepareEnrollment(
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

  if (
    !body ||
    Object.keys(body).length !== 0
  ) {
    return invalidRequestResponse();
  }

  const challengeToken =
    cookies.get(
      ADMIN_CHALLENGE_COOKIE_NAME,
    )?.value;

  if (!challengeToken) {
    return invalidChallengeResponse(
      context,
      siteOrigin,
    );
  }

  const result =
    await prepareAdminTotpEnrollment({
      challengeToken,
      now:
        new Date(),
    });

  if (!result.ok) {
    return invalidChallengeResponse(
      context,
      siteOrigin,
    );
  }

  return createAdminAuthJsonResponse(
    {
      ok: true,

      secretBase32:
        result.secretBase32,

      enrollmentUri:
        result.enrollmentUri,
    },
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handlePrepareEnrollment(
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