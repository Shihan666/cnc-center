import type {
  APIRoute,
} from "astro";

import {
  verifyPayment,
} from "../../../../../server/payments/verification-service.ts";

export const GET: APIRoute =
  async ({
    request,
  }) => {

    const url =
      new URL(
        request.url,
      );

    const authority =
      url.searchParams.get(
        "Authority",
      );

    const status =
      url.searchParams.get(
        "Status",
      );

    const orderId =
      url.searchParams.get(
        "orderId",
      );

    const amountRial =
      Number(
        url.searchParams.get(
          "amountRial",
        ),
      );

    const resultUrl =
      new URL(
        "/payment/result",
        url.origin,
      );

    if (
      !authority ||
      !orderId ||
      status !== "OK"
    ) {
      resultUrl.searchParams.set(
        "verified",
        "false",
      );

      if (orderId) {
        resultUrl.searchParams.set(
          "orderId",
          orderId,
        );
      }

      return Response.redirect(
        resultUrl,
        302,
      );
    }

    try {
      const payment =
        await verifyPayment({
          orderId,

          authority,

          amountRial,
        });

      resultUrl.searchParams.set(
        "verified",
        "true",
      );

      resultUrl.searchParams.set(
        "orderId",
        orderId,
      );

      if (
        payment?.refId
      ) {
        resultUrl.searchParams.set(
          "refId",
          payment.refId,
        );
      }

      return Response.redirect(
        resultUrl,
        302,
      );

    } catch {
      resultUrl.searchParams.set(
        "verified",
        "false",
      );

      resultUrl.searchParams.set(
        "orderId",
        orderId,
      );

      return Response.redirect(
        resultUrl,
        302,
      );
    }
  };

