import {
  createPaymentRecord,
  updatePaymentAuthority,
} from "./repository.ts";

import {
  createZarinPalRequest,
} from "./providers/zarinpal.ts";

export interface StartPaymentInput {
  orderId: string;
  amountRial: number;
  callbackUrl: string;
  description: string;
}

export async function startPayment(
  input: StartPaymentInput,
) {
  const payment =
    await createPaymentRecord({
      orderId:
        input.orderId,

      provider:
        "zarinpal",

      environment:
        process.env.ZARINPAL_SANDBOX === "true"
          ? "sandbox"
          : "production",

      amountRial:
        input.amountRial,
    });

  const request =
    await createZarinPalRequest({
      amountRial:
        input.amountRial,

      callbackUrl:
        input.callbackUrl,

      description:
        input.description,

      orderId:
        input.orderId,
    });

  return updatePaymentAuthority(
    payment.id,
    request.authority,
  );
}
