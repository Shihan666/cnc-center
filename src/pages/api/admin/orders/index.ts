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
  parseAdminOrderListQuery,
} from '../../../../server/orders/read-model.ts';

import {
  getAdminOrdersSnapshot,
} from '../../../../server/orders/admin-read-model.ts';

async function handleOrdersList(
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

  const query =
    parseAdminOrderListQuery(
      context.url.searchParams,
    );

  const result =
    await getAdminOrdersSnapshot(
      query,
    );

  return createAdminAuthJsonResponse(
    {
      ok: true,

      query,

      orders:
        result.items,

      pagination: {
        total:
          result.total,

        page:
          result.page,

        pageSize:
          result.pageSize,

        totalPages:
          result.totalPages,
      },
    },
  );
}

export const GET: APIRoute =
  async (context) => {
    try {
      return await handleOrdersList(
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