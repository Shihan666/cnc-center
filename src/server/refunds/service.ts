import {
  createRefund,
  getRefundsByOrderId,
  updateRefundStatus,
} from "./repository.ts";


export async function requestRefund(
  input: {
    orderId: string;
    paymentId: string;
    amountRial: number;
    reason?: string;
  },
) {

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
    refundedAmount >=
    input.amountRial
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

  return updateRefundStatus(
    refundId,
    "completed",
  );

}


export async function failRefund(
  refundId: string,
) {

  return updateRefundStatus(
    refundId,
    "failed",
  );

}
