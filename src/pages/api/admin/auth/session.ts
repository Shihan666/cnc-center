import type {
  APIContext,
  APIRoute,
} from 'astro';

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminAuthJsonResponse,
  getAdminSessionCookieDeleteOptions,
} from '../../../../server/auth/http.ts';

import {
  resolveAdminSession,
} from '../../../../server/auth/service.ts';

function invalidSessionResponse(
  context: APIContext,
  siteOrigin: string,
): Response {
  context.cookies.delete(
    ADMIN_SESSION_COOKIE_NAME,
    getAdminSessionCookieDeleteOptions(
      siteOrigin,
    ),
  );

  return createAdminAuthJsonResponse(
    {
      ok: false,
      reason: 'invalid_session',
    },
    401,
  );
}

async function handleSession(
  context: APIContext,
): Promise<Response> {
  const {
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

  const sessionToken =
    cookies.get(
      ADMIN_SESSION_COOKIE_NAME,
    )?.value;

  if (!sessionToken) {
    return invalidSessionResponse(
      context,
      siteOrigin,
    );
  }

  const resolved =
    await resolveAdminSession({
      sessionToken,

      now:
        new Date(),
    });

  if (!resolved) {
    return invalidSessionResponse(
      context,
      siteOrigin,
    );
  }

  return createAdminAuthJsonResponse(
    {
      ok: true,

      admin:
        resolved.admin,

      authMethod:
        resolved.authMethod,

      idleExpiresAt:
        resolved.idleExpiresAt
          .toISOString(),

      absoluteExpiresAt:
        resolved.absoluteExpiresAt
          .toISOString(),
    },
  );
}

export const GET: APIRoute =
  async (context) => {
    try {
      return await handleSession(
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