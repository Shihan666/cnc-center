import type {
  CanonicalCommerceCurrency,
} from "../../config/commerce";

export type PaymentProviderId =
  "zarinpal";

export type PaymentEnvironment =
  | "sandbox"
  | "production";

export interface PaymentRequestInput {
  orderId: string;

  amountRial: number;

  currency:
    CanonicalCommerceCurrency;

  description: string;

  callbackUrl: string;

  mobile?: string;
}

export interface PaymentRequestResult {
  provider:
    PaymentProviderId;

  authority: string;

  redirectUrl: string;
}

export interface PaymentVerificationInput {
  orderId: string;

  authority: string;

  /*
   * This amount must come from the
   * server-side order record.
   * It must never be trusted from
   * callback query parameters.
   */
  amountRial: number;

  currency:
    CanonicalCommerceCurrency;
}

export type PaymentVerificationStatus =
  | "paid"
  | "already-verified"
  | "failed";

export interface PaymentVerificationResult {
  provider:
    PaymentProviderId;

  authority: string;

  status:
    PaymentVerificationStatus;

  refId?: string;

  providerCode?: number;

  message?: string;
}

export interface PaymentGatewayAdapter {
  readonly provider:
    PaymentProviderId;

  readonly environment:
    PaymentEnvironment;

  createPayment(
    input: PaymentRequestInput,
  ): Promise<PaymentRequestResult>;

  verifyPayment(
    input: PaymentVerificationInput,
  ): Promise<PaymentVerificationResult>;
}
