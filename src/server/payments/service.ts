import type {
  CreatePaymentRequestInput,
  PaymentRequestResult,
  VerifyPaymentResult,
} from "./types.ts";

export async function createPaymentRequest(
  input: CreatePaymentRequestInput,
): Promise<PaymentRequestResult> {
  throw new Error(
    "Payment provider is not configured.",
  );
}

export async function verifyPayment(
  paymentId: string,
): Promise<VerifyPaymentResult> {
  throw new Error(
    "Payment provider is not configured.",
  );
}
