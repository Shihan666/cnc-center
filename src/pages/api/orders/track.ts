import type {
  APIRoute,
} from 'astro';

import {
  createAdminAuthJsonResponse,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../../server/auth/http.ts';

import {
  getPublicOrderTracking,
} from '../../../server/orders/public-tracking-service.ts';

async function handlePublicOrderTracking(
  context:
    Parameters<APIRoute>[0],
): Promise<Response> {
  const site =
    context.site;

  if (!site) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'server_error',
      },
      500,
    );
  }

  if (
    !isAdminAuthJsonRequest(
      context.request,
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

  if (
    !isSameAdminAuthOrigin(
      context.request,
      site.origin,
    )
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'forbidden',
      },
      403,
    );
  }

  const body =
    await readAdminAuthJsonObject(
      context.request,
    );

  if (!body) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_json',
      },
      400,
    );
  }

  const result =
    await getPublicOrderTracking({
      orderNumber:
        body.orderNumber,

      phone:
        body.phone,
    });

  if (
    result.status ===
    'invalid_input'
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_input',
      },
      400,
    );
  }

  if (
    result.status ===
    'not_found'
  ) {
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

      order: {
        orderNumber:
          result.order.orderNumber,

        status:
          result.order.status,

        createdAt:
          result.order.createdAt
            .toISOString(),

        updatedAt:
          result.order.updatedAt
            .toISOString(),

        paidAt:
          result.order.paidAt
            ?.toISOString() ??
          null,
      },
    },
    200,
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handlePublicOrderTracking(
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