import type {
  APIRoute,
} from "astro";

import {
  verifyPayment,
} from "../../../../server/payments/verification-service.ts";

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

    if (
      !authority ||
      !orderId ||
      status !== "OK"
    ) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason:
            "payment_cancelled",
        }),
        {
          status: 400,
          headers: {
            "content-type":
              "application/json",
          },
        },
      );
    }

    try {
      const payment =
        await verifyPayment({
          orderId,

          authority,

          amountRial:
            Number(
              url.searchParams.get(
                "amountRial",
              ),
            ),
        });

      return new Response(
        JSON.stringify({
          ok: true,
          payment,
        }),
        {
          status: 200,
          headers: {
            "content-type":
              "application/json",
          },
        },
      );

    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          reason:
            "verification_failed",
        }),
        {
          status: 500,
          headers: {
            "content-type":
              "application/json",
          },
        },
      );
    }
  };
