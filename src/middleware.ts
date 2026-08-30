import {
  defineMiddleware,
} from 'astro/middleware';

import {
  classifyAdminPagePath,
} from './server/admin-entry.ts';

import {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminSessionCookieDeleteOptions,
} from './server/auth/http.ts';

import {
  resolveAdminSession,
} from './server/auth/service.ts';

const ADMIN_LOGIN_PATH =
  '/admin/auth/login';

const ADMIN_PAGE_CACHE_CONTROL =
  'private, no-store';

const ADMIN_PAGE_ROBOTS =
  'noindex, nofollow';

function applyAdminResponseHeaders(
  response: Response,
): Response {
  response.headers.set(
    'Cache-Control',
    ADMIN_PAGE_CACHE_CONTROL,
  );

  response.headers.set(
    'X-Robots-Tag',
    ADMIN_PAGE_ROBOTS,
  );

  return response;
}

function createAdminServerErrorResponse(): Response {
  return new Response(
    'Internal Server Error',
    {
      status: 500,

      headers: {
        'Content-Type':
          'text/plain; charset=utf-8',

        'Cache-Control':
          ADMIN_PAGE_CACHE_CONTROL,

        'X-Robots-Tag':
          ADMIN_PAGE_ROBOTS,
      },
    },
  );
}

export const onRequest =
  defineMiddleware(
    async (
      context,
      next,
    ) => {
      const classification =
        classifyAdminPagePath(
          context.url.pathname,
        );

      if (
        classification ===
        'non_admin'
      ) {
        return next();
      }

      if (
        classification ===
        'auth_entry'
      ) {
        return applyAdminResponseHeaders(
          await next(),
        );
      }

      const site =
        context.site;

      if (!site) {
        return createAdminServerErrorResponse();
      }

      const siteOrigin =
        site.origin;

      let sessionToken: string | undefined;

      try {
        sessionToken =
          context.cookies.get(
            ADMIN_SESSION_COOKIE_NAME,
          )?.value;
      } catch {
        return createAdminServerErrorResponse();
      }

      if (!sessionToken) {
        try {
          context.cookies.delete(
            ADMIN_SESSION_COOKIE_NAME,
            getAdminSessionCookieDeleteOptions(
              siteOrigin,
            ),
          );
        } catch {
          return createAdminServerErrorResponse();
        }

        return applyAdminResponseHeaders(
          context.redirect(
            ADMIN_LOGIN_PATH,
          ),
        );
      }

      let resolved;

      try {
        resolved =
          await resolveAdminSession({
            sessionToken,
            now:
              new Date(),
          });
      } catch {
        return createAdminServerErrorResponse();
      }

      if (!resolved) {
        try {
          context.cookies.delete(
            ADMIN_SESSION_COOKIE_NAME,
            getAdminSessionCookieDeleteOptions(
              siteOrigin,
            ),
          );
        } catch {
          return createAdminServerErrorResponse();
        }

        return applyAdminResponseHeaders(
          context.redirect(
            ADMIN_LOGIN_PATH,
          ),
        );
      }

      context.locals.adminSession = {
        admin: {
          id:
            resolved.admin.id,

          email:
            resolved.admin.email,
        },

        authMethod:
          resolved.authMethod,

        idleExpiresAt:
          resolved.idleExpiresAt,

        absoluteExpiresAt:
          resolved.absoluteExpiresAt,
      };

      return applyAdminResponseHeaders(
        await next(),
      );
    },
  );
