import {
  requestRefund,
  processRefund,
  completeRefund,
  failRefund,
} from "./service.ts";


export async function createRefundRequest(
  input: {
    orderId: string;
    paymentId: string;
    amountRial: number;
    reason?: string;
  },
) {
  return requestRefund(
    input,
  );
}


export async function startRefundProcess(
  refundId: string,
) {
  return processRefund(
    refundId,
  );
}


export async function completeRefundProcess(
  refundId: string,
) {
  return completeRefund(
    refundId,
  );
}


export async function failRefundProcess(
  refundId: string,
) {
  return failRefund(
    refundId,
  );
}
