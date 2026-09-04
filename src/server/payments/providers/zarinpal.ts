export interface ZarinPalRequestInput {
  amountRial: number;
  callbackUrl: string;
  description: string;
  orderId: string;
}

export interface ZarinPalRequestResult {
  authority: string;
  paymentUrl: string;
}

export interface ZarinPalVerifyInput {
  authority: string;
  amountRial: number;
}

export interface ZarinPalVerifyResult {
  success: boolean;
  refId: string | null;
  code: number | null;
}

function requireAmount(
  amountRial: number,
): void {
  if (
    !Number.isInteger(amountRial) ||
    amountRial <= 0
  ) {
    throw new Error(
      "Invalid payment amount.",
    );
  }
}

export async function createZarinPalRequest(
  input: ZarinPalRequestInput,
): Promise<ZarinPalRequestResult> {
  requireAmount(
    input.amountRial,
  );

  throw new Error(
    "ZarinPal request provider is not connected.",
  );
}

export async function verifyZarinPalPayment(
  input: ZarinPalVerifyInput,
): Promise<ZarinPalVerifyResult> {
  requireAmount(
    input.amountRial,
  );

  throw new Error(
    "ZarinPal verify provider is not connected.",
  );
}
