import type {
  APIContext,
} from 'astro';

import {
  ADMIN_SESSION_COOKIE_NAME,
  getAdminSessionCookieDeleteOptions,
} from './auth/http.ts';

import type {
  ResolvedAdminSession,
} from './auth/service-contract.ts';

import {
  resolveAdminSession,
} from './auth/service.ts';

type AdminApiSessionContext =
  Pick<
    APIContext,
    | 'cookies'
    | 'site'
  >;

export async function resolveAdminApiSession(
  context: AdminApiSessionContext,
): Promise<ResolvedAdminSession | null> {
  const site =
    context.site;

  if (!site) {
    throw new Error(
      'Astro site configuration is required for admin API authentication.',
    );
  }

  const siteOrigin =
    site.origin;

  const sessionToken =
    context.cookies.get(
      ADMIN_SESSION_COOKIE_NAME,
    )?.value;

  if (!sessionToken) {
    context.cookies.delete(
      ADMIN_SESSION_COOKIE_NAME,
      getAdminSessionCookieDeleteOptions(
        siteOrigin,
      ),
    );

    return null;
  }

  const resolved =
    await resolveAdminSession({
      sessionToken,
      now:
        new Date(),
    });

  if (!resolved) {
    context.cookies.delete(
      ADMIN_SESSION_COOKIE_NAME,
      getAdminSessionCookieDeleteOptions(
        siteOrigin,
      ),
    );

    return null;
  }

  return resolved;
}