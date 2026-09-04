export type PaymentStatus =
  | "pending"
  | "paid"
  | "failed";

export interface CreatePaymentRequestInput {
  orderId: string;
  amountRial: number;
}

export interface PaymentRequestResult {
  paymentId: string;
  authority: string | null;
}

export interface VerifyPaymentResult {
  status:
    | "paid"
    | "failed";
}
