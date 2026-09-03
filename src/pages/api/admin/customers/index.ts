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
  parseAdminCustomerListQuery,
} from '../../../../server/customers/read-model.ts';

import {
  listAdminCustomers,
} from '../../../../server/customers/repository.ts';

async function handleCustomersList(
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
    parseAdminCustomerListQuery(
      context.url.searchParams,
    );

  const result =
    await listAdminCustomers(
      query,
    );

  return createAdminAuthJsonResponse(
    {
      ok: true,

      query,

      customers:
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
      return await handleCustomersList(
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