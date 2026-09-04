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
  parseAdminInventoryListQuery,
} from '../../../../server/inventory/read-model.ts';

import {
  getAdminInventorySummary,
  listAdminInventory,
  listRecentAdminInventoryMovements,
} from '../../../../server/inventory/repository.ts';

async function handleInventoryList(
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
    parseAdminInventoryListQuery(
      context.url.searchParams,
    );

  const [
    result,
    movements,
    summary,
  ] =
    await Promise.all([
      listAdminInventory(
        query,
      ),
      listRecentAdminInventoryMovements(),
      getAdminInventorySummary(),
    ]);

  return createAdminAuthJsonResponse(
    {
      ok: true,

      query,

      inventory:
        result.items,

      movements,

      summary,

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
      return await handleInventoryList(
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
