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
  parseAdjustAdminProductInventoryInput,
} from '../../../../../server/products/admin-model.ts';

import {
  adjustAdminProductInventory,
} from '../../../../../server/products/repository.ts';

async function handleProductInventoryAdjustment(
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
    parseAdjustAdminProductInventoryInput(
      body,
    );

  if (!input) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_inventory_adjustment',
      },
      400,
    );
  }

  const productId =
    context.params.id ?? '';

  try {
    const product =
      await adjustAdminProductInventory(
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
      error instanceof Error &&
      (
        error.message ===
          'Inventory adjustment cannot make on-hand quantity negative.' ||
        error.message ===
          'Inventory adjustment cannot reduce on-hand quantity below reserved quantity.'
      )
    ) {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            'inventory_conflict',
        },
        409,
      );
    }

    throw error;
  }
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleProductInventoryAdjustment(
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