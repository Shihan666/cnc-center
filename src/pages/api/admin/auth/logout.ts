import type {
  APIContext,
  APIRoute,
} from 'astro';

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminAuthJsonResponse,
  getAdminSessionCookieDeleteOptions,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../../../server/auth/http.ts';

import {
  revokeAdminSession,
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

function deleteSessionCookie(
  context: APIContext,
  siteOrigin: string,
): void {
  context.cookies.delete(
    ADMIN_SESSION_COOKIE_NAME,
    getAdminSessionCookieDeleteOptions(
      siteOrigin,
    ),
  );
}

async function handleLogout(
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

  const sessionToken =
    cookies.get(
      ADMIN_SESSION_COOKIE_NAME,
    )?.value;

  if (sessionToken) {
    await revokeAdminSession({
      sessionToken,
      reason: 'logout',
      now:
        new Date(),
    });
  }

  deleteSessionCookie(
    context,
    siteOrigin,
  );

  return createAdminAuthJsonResponse(
    {
      ok: true,
    },
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleLogout(
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