import type {
  APIRoute,
} from "astro";

import {
  resolveAdminApiSession,
} from "../../../../../server/admin-api-session.ts";

import {
  createAdminAuthJsonResponse,
  isAdminAuthJsonRequest,
  isSameAdminAuthOrigin,
} from "../../../../../server/auth/http.ts";

import {
  failRefundProcess,
} from "../../../../../server/refunds/routes.ts";


export const POST: APIRoute =
  async (
    context,
  ) => {

    if (!context.site) {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            "server_error",
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
            "unsupported_media_type",
        },
        415,
      );
    }


    if (
      !isSameAdminAuthOrigin(
        context.request,
        context.site.origin,
      )
    ) {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            "forbidden",
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
            "invalid_session",
        },
        401,
      );
    }


    const refundId =
      context.params.id;


    if (!refundId) {
      return createAdminAuthJsonResponse(
        {
          ok: false,
          reason:
            "invalid_refund_id",
        },
        400,
      );
    }


    const refund =
      await failRefundProcess(
        refundId,
      );


    return createAdminAuthJsonResponse(
      {
        ok: true,
        refund,
      },
      200,
    );

  };
