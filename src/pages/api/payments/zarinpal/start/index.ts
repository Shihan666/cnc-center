import type {
  APIRoute,
} from "astro";

import {
  startPayment,
} from "../../../../../server/payments/service.ts";

export const POST: APIRoute =
  async ({
    request,
  }) => {
    try {
      const body =
        await request.json();

      const payment =
        await startPayment({
          orderId:
            body.orderId,

          amountRial:
            Number(
              body.amountRial,
            ),

          callbackUrl:
            body.callbackUrl,

          description:
            body.description,
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
            "payment_start_failed",
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

