import type {
  APIRoute,
} from "astro";

import {
  createRefundRequest,
} from "../../../../server/refunds/routes.ts";


export const POST: APIRoute =
  async ({
    request,
    params,
  }) => {

    try {

      const body =
        await request.json();


      const result =
        await createRefundRequest(
          {
            orderId:
              params.id as string,

            paymentId:
              body.paymentId,

            amountRial:
              Number(
                body.amountRial,
              ),

            reason:
              body.reason,
          },
        );


      return new Response(
        JSON.stringify({
          ok: true,
          refund:
            result,
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
            "refund_request_failed",
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
