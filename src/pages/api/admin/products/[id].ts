import type {
  APIRoute,
} from 'astro';

import {
  resolveAdminApiSession,
} from '../../../../server/admin-api-session.ts';

import {
  createAdminAuthJsonResponse,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
  readAdminAuthJsonObject,
} from '../../../../server/auth/http.ts';

import {
  isAdminProductUniqueViolation,
  parseUpdateAdminProductInput,
} from '../../../../server/products/admin-model.ts';

import {
  updateAdminProduct,
} from '../../../../server/products/repository.ts';

import {
  getAdminProductDetailSnapshot,
} from '../../../../server/products/admin-detail-read-model.ts';

async function handleProductDetail(
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

  const productId =
    context.params.id ?? '';

  const product =
    await getAdminProductDetailSnapshot(
      productId,
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

async function handleProductUpdate(
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
    parseUpdateAdminProductInput(
      body,
    );

  if (!input) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_product',
      },
      400,
    );
  }

  const productId =
    context.params.id ?? '';

  try {
    const product =
      await updateAdminProduct(
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
  } catch (error) {
    if (
      isAdminProductUniqueViolation(
        error,
      )
    ) {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            'product_conflict',
        },
        409,
      );
    }

    throw error;
  }
}

export const GET: APIRoute =
  async (context) => {
    try {
      return await handleProductDetail(
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

export const PATCH: APIRoute =
  async (context) => {
    try {
      return await handleProductUpdate(
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