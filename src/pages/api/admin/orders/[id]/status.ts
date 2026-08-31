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
  isAdminOrderStatus,
} from '../../../../../server/orders/read-model.ts';

import {
  transitionAdminOrderStatus,
} from '../../../../../server/orders/repository.ts';

async function handleOrderStatusUpdate(
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

  const rawToStatus =
    body.toStatus;

  if (
    typeof rawToStatus !==
      'string'
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_status',
      },
      400,
    );
  }

  const toStatus =
    rawToStatus.trim();

  if (
    !isAdminOrderStatus(
      toStatus,
    )
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_status',
      },
      400,
    );
  }

  const rawReason =
    body.reason;

  let reason:
    | string
    | null =
    null;

  if (
    rawReason !==
      undefined &&
    rawReason !== null
  ) {
    if (
      typeof rawReason !==
      'string'
    ) {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            'invalid_reason',
        },
        400,
      );
    }

    const normalizedReason =
      rawReason
        .trim()
        .replace(
          /\s+/g,
          ' ',
        )
        .slice(
          0,
          500,
        );

    reason =
      normalizedReason ||
      null;
  }

  const orderId =
    context.params.id ??
    '';

  const result =
    await transitionAdminOrderStatus({
      orderId,

      toStatus,

      reason,

      changedAt:
        new Date(),
    });

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

  if (
    result.status ===
    'invalid_transition'
  ) {
    return createAdminAuthJsonResponse(
      {
        ok: false,
        reason:
          'invalid_transition',

        fromStatus:
          result.fromStatus,

        toStatus:
          result.toStatus,
      },
      409,
    );
  }

  return createAdminAuthJsonResponse(
    {
      ok: true,

      transition: {
        orderId:
          result.orderId,

        fromStatus:
          result.fromStatus,

        toStatus:
          result.toStatus,

        updatedAt:
          result.updatedAt,

        historyId:
          result.historyId,

        historyCreatedAt:
          result.historyCreatedAt,
      },
    },
  );
}

export const POST: APIRoute =
  async (context) => {
    try {
      return await handleOrderStatusUpdate(
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