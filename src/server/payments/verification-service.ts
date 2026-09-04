import {
  markPaymentPaid,
  markPaymentFailed,
  getPaymentByOrderId,
} from "./repository.ts";

import {
  verifyZarinPalPayment,
} from "./providers/zarinpal.ts";

import {
  consumePaidOrderReservations,
} from "../orders/reservation-repository.ts";

import {
  markOrderPaidAfterPayment,
} from "../orders/repository.ts";

export interface VerifyPaymentInput {
  orderId: string;
  authority: string;
  amountRial: number;
}

export async function verifyPayment(
  input: VerifyPaymentInput,
) {
  const payment =
    await getPaymentByOrderId(
      input.orderId,
    );

  if (!payment) {
    throw new Error(
      "Payment record not found.",
    );
  }

  if (
    payment.status === "paid"
  ) {
    return payment;
  }

  const result =
    await verifyZarinPalPayment({
      authority:
        input.authority,

      amountRial:
        input.amountRial,
    });

  if (
    result.success &&
    result.refId
  ) {
    const paidPayment =
      await markPaymentPaid(
        payment.id,
        result.refId,
      );

    await markOrderPaidAfterPayment(
      input.orderId,
    );

    await consumePaidOrderReservations({
      orderId:
        input.orderId,

      consumedAt:
        new Date(),
    });

    return paidPayment;
  }

  return markPaymentFailed(
    payment.id,
    "Payment verification failed.",
  );
}



