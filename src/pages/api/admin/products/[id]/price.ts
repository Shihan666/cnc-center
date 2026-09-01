import type {
  APIRoute,
} from 'astro';

import {
  resolveAdminApiSession,
} from '../../../../../server/admin-api-session.ts';

import {
  createAdminAuthJsonResponse,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../../../../server/auth/http.ts';

import {
  parseSetAdminProductPriceInput,
} from '../../../../../server/products/admin-model.ts';

import {
  setAdminProductPrice,
} from '../../../../../server/products/repository.ts';

async function handleProductPriceUpdate(
  context: Parameters<APIRoute>[0],
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

  const input =
    parseSetAdminProductPriceInput(
      body,
    );

  if (!input) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_price',
      },
      400,
    );
  }

  const productId =
    context.params.id ?? '';

  const product =
    await setAdminProductPrice(
      productId,
      input,
    );

  if (!product) {
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
      product,
    },
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleProductPriceUpdate(
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