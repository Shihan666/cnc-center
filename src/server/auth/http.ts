import type {
  AstroCookieSetOptions,
} from 'astro';

import {
  ADMIN_LOGIN_CHALLENGE_TTL_MS,
  ADMIN_SESSION_ABSOLUTE_TTL_MS,
} from './service-contract.ts';

type AstroCookieDeleteOptions =
  Omit<
    AstroCookieSetOptions,
    'expires' | 'maxAge' | 'encode'
  >;

export const ADMIN_AUTH_API_PREFIX =
  '/api/admin/auth';

export const ADMIN_CHALLENGE_COOKIE_NAME =
  'cnc_admin_challenge';

export const ADMIN_SESSION_COOKIE_NAME =
  'cnc_admin_session';

export const ADMIN_CHALLENGE_COOKIE_PATH =
  ADMIN_AUTH_API_PREFIX;

export const ADMIN_SESSION_COOKIE_PATH =
  '/';

function millisecondsToCookieSeconds(
  milliseconds: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds <= 0 ||
    milliseconds % 1_000 !== 0
  ) {
    throw new Error(
      `${label} must be a positive whole-second duration.`,
    );
  }

  return milliseconds / 1_000;
}

export const ADMIN_CHALLENGE_COOKIE_MAX_AGE_SECONDS =
  millisecondsToCookieSeconds(
    ADMIN_LOGIN_CHALLENGE_TTL_MS,
    'Admin challenge cookie lifetime',
  );

export const ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS =
  millisecondsToCookieSeconds(
    ADMIN_SESSION_ABSOLUTE_TTL_MS,
    'Admin session cookie lifetime',
  );

function parseCanonicalSiteOrigin(
  siteOrigin: string,
): URL {
  const trimmed =
    siteOrigin.trim();

  if (!trimmed) {
    throw new Error(
      'Admin auth site origin is required.',
    );
  }

  let parsed: URL;

  try {
    parsed =
      new URL(trimmed);
  } catch {
    throw new Error(
      'Admin auth site origin must be a valid absolute URL origin.',
    );
  }

  if (
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'https:'
  ) {
    throw new Error(
      'Admin auth site origin must use http or https.',
    );
  }

  if (trimmed !== parsed.origin) {
    throw new Error(
      'Admin auth site origin must contain only the canonical origin.',
    );
  }

  return parsed;
}

export function isSameAdminAuthOrigin(
  request: Request,
  siteOrigin: string,
): boolean {
  const expected =
    parseCanonicalSiteOrigin(
      siteOrigin,
    );

  const originHeader =
    request.headers.get(
      'origin',
    );

  if (
    !originHeader ||
    originHeader === 'null'
  ) {
    return false;
  }

  let actual: URL;

  try {
    actual =
      new URL(originHeader);
  } catch {
    return false;
  }

  return (
    originHeader === actual.origin &&
    actual.origin === expected.origin
  );
}
function usesSecureAdminAuthCookies(
  siteOrigin: string,
): boolean {
  return (
    parseCanonicalSiteOrigin(
      siteOrigin,
    ).protocol === 'https:'
  );
}

function createCookieSetOptions(
  siteOrigin: string,
  path: string,
  maxAge: number,
): AstroCookieSetOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure:
      usesSecureAdminAuthCookies(
        siteOrigin,
      ),
    path,
    maxAge,
  };
}

function createCookieDeleteOptions(
  siteOrigin: string,
  path: string,
): AstroCookieDeleteOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure:
      usesSecureAdminAuthCookies(
        siteOrigin,
      ),
    path,
  };
}

export function getAdminChallengeCookieOptions(
  siteOrigin: string,
): AstroCookieSetOptions {
  return createCookieSetOptions(
    siteOrigin,
    ADMIN_CHALLENGE_COOKIE_PATH,
    ADMIN_CHALLENGE_COOKIE_MAX_AGE_SECONDS,
  );
}

export function getAdminChallengeCookieDeleteOptions(
  siteOrigin: string,
): AstroCookieDeleteOptions {
  return createCookieDeleteOptions(
    siteOrigin,
    ADMIN_CHALLENGE_COOKIE_PATH,
  );
}

export function getAdminSessionCookieOptions(
  siteOrigin: string,
): AstroCookieSetOptions {
  return createCookieSetOptions(
    siteOrigin,
    ADMIN_SESSION_COOKIE_PATH,
    ADMIN_SESSION_COOKIE_MAX_AGE_SECONDS,
  );
}

export function getAdminSessionCookieDeleteOptions(
  siteOrigin: string,
): AstroCookieDeleteOptions {
  return createCookieDeleteOptions(
    siteOrigin,
    ADMIN_SESSION_COOKIE_PATH,
  );
}
export const ADMIN_AUTH_JSON_CONTENT_TYPE =
  'application/json';

export const ADMIN_AUTH_CACHE_CONTROL =
  'no-store';

export function isAdminAuthJsonRequest(
  request: Request,
): boolean {
  const contentType =
    request.headers.get(
      'content-type',
    );

  if (!contentType) {
    return false;
  }

  const mediaType =
    contentType
      .split(';', 1)[0]
      ?.trim()
      .toLowerCase();

  return (
    mediaType ===
    ADMIN_AUTH_JSON_CONTENT_TYPE
  );
}

export async function readAdminAuthJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  let value: unknown;

  try {
    value =
      await request.json();
  } catch {
    return null;
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as
    Record<string, unknown>;
}

export function createAdminAuthJsonResponse(
  body: Readonly<Record<string, unknown>>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        'Content-Type':
          'application/json; charset=utf-8',

        'Cache-Control':
          ADMIN_AUTH_CACHE_CONTROL,
      },
    },
  );
}