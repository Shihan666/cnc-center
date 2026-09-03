import type {
  APIRoute,
} from 'astro';

import type {
  CheckoutSubmissionInput,
} from '../../lib/orders/types.ts';

import {
  createAdminAuthJsonResponse,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../server/auth/http.ts';

import {
  createPublicCheckoutOrder,
} from '../../server/orders/public-service.ts';

async function handlePublicOrderCreate(
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
    await createPublicCheckoutOrder({
      submission:
        body as unknown as
          CheckoutSubmissionInput,

      createdAt:
        new Date(),
    });

  if (
    result.status ===
    'invalid_order'
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_order',
        errors:
          result.errors,
      },
      400,
    );
  }

  if (
    result.status ===
    'stock_unavailable'
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'stock_unavailable',
        productId:
          result.contentId,
      },
      409,
    );
  }

  if (
    result.status ===
    'commerce_changed'
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'commerce_changed',
        productId:
          result.contentId,
      },
      409,
    );
  }

  return createAdminAuthJsonResponse(
    {
      ok: true,

      order: {
        id:
          result.orderId,

        orderNumber:
          result.orderNumber,

        status:
          result.orderStatus,

        createdAt:
          result.createdAt
            .toISOString(),

        reservationExpiresAt:
          result
            .reservationExpiresAt
            .toISOString(),
      },
    },
    201,
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handlePublicOrderCreate(
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