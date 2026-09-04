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
  getAdminOrderDetailSnapshot,
} from '../../../../server/orders/admin-detail-read-model.ts';

async function handleOrderDetail(
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

  const orderId =
    context.params.id ?? '';

  const order =
    await getAdminOrderDetailSnapshot(
      orderId,
    );

  if (!order) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'not_found',
      },
      404,
    );
  }

  return createAdminAuthJsonResponse(
    {
      ok: true,
      order,
    },
  );
}

export const GET: APIRoute =
  async (context) => {
    try {
      return await handleOrderDetail(
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