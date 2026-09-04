import type {
  APIRoute,
} from 'astro';

import {
  resolveAdminApiSession,
} from '../../../../server/admin-api-session.ts';

import {
  createAdminAuthJsonResponse,
} from '../../../../server/auth/http.ts';

import {
  getAdminDashboardSnapshot,
} from '../../../../server/dashboard/repository.ts';

async function handleDashboard(
  context: Parameters<APIRoute>[0],
): Promise<Response> {
  const session =
    await resolveAdminApiSession(
      context,
    );

  if (!session) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_session',
      },
      401,
    );
  }

  const dashboard =
    await getAdminDashboardSnapshot();

  return createAdminAuthJsonResponse(
    {
      ok: true,
      dashboard,
    },
  );
}

export const GET: APIRoute =
  async (context) => {
    try {
      return await handleDashboard(
        context,
      );
    } catch {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            'server_error',
        },
        500,
      );
    }
  };
