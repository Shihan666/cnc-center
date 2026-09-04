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
  parseCreateAdminProductInput,
} from '../../../../server/products/admin-model.ts';

import {
  createAdminProduct,
  getAdminProductsSnapshot,
} from '../../../../server/products/repository.ts';

async function handleProductsList(
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

  const products =
    await getAdminProductsSnapshot();

  return createAdminAuthJsonResponse(
    {
      ok: true,
      products,
    },
  );
}

async function handleProductCreate(
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
    parseCreateAdminProductInput(
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

  try {
    const product =
      await createAdminProduct(
        input,
      );

    return createAdminAuthJsonResponse(
      {
        ok: true,
        product,
      },
      201,
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
      return await handleProductsList(
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

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleProductCreate(
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