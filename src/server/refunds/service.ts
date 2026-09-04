import {
  createRefund,
  getRefundsByOrderId,
  updateRefundStatus,
} from "./repository.ts";

import {
  markPaymentRefunded,
  getPaymentById,
} from "../payments/repository.ts";

import {
  createOrderStatusHistory,
} from "../orders/status-history-repository.ts";


export async function requestRefund(
  input: {
    orderId: string;
    paymentId: string;
    amountRial: number;
    reason?: string;
  },
) {

  const payment =
    await getPaymentById(
      input.paymentId,
    );


  if (!payment) {
    throw new Error(
      "payment_not_found",
    );
  }


  if (
    payment.status !== "paid"
    &&
    payment.status !== "refunded"
  ) {
    throw new Error(
      "payment_not_refundable",
    );
  }


  const refunds =
    await getRefundsByOrderId(
      input.orderId,
    );


  const refundedAmount =
    refunds
      .filter(
        (refund) =>
          refund.status === "completed",
      )
      .reduce(
        (
          total,
          refund,
        ) =>
          total +
          refund.amountRial,
        0,
      );


  if (
    refundedAmount +
      input.amountRial
      >
      payment.amountRial
  ) {
    throw new Error(
      "refund_amount_exceeded",
    );
  }


  return createRefund(
    input,
  );
}


export async function processRefund(
  refundId: string,
) {

  return updateRefundStatus(
    refundId,
    "processing",
  );

}


export async function completeRefund(
  refundId: string,
) {

  const refund =
    await updateRefundStatus(
      refundId,
      "completed",
    );


  if (refund?.paymentId) {
    await markPaymentRefunded(
      refund.paymentId,
    );
  }


  if (refund?.orderId) {
    await createOrderStatusHistory(
      {
        orderId:
          refund.orderId,

        status:
          "cancelled",

        referenceType:
          "refund",

        referenceId:
          refund.id,

        note:
          "refund_completed",
      },
    );
  }


  return refund;

}


export async function failRefund(
  refundId: string,
) {

  return updateRefundStatus(
    refundId,
    "failed",
  );

}








