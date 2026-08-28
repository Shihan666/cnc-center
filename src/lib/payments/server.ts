import {
  commerceConfig,
} from "../../config/commerce";

import type {
  PreparedOrderDraft,
} from "../orders/types";

import type {
  OrderRepository,
  PendingOrderRecord,
} from "../orders/repository";

import type {
  PaymentGatewayAdapter,
  PaymentRequestResult,
  PaymentVerificationResult,
} from "./types";

export class PaymentRuntimeDisabledError
  extends Error {
  constructor() {
    super(
      "Real payment runtime is disabled until server deployment is explicitly enabled.",
    );

    this.name =
      "PaymentRuntimeDisabledError";
  }
}

function assertPaymentRuntimeEnabled(): void {
  if (
    !commerceConfig.payment
      .productionEnabled
  ) {
    throw new PaymentRuntimeDisabledError();
  }

  if (
    commerceConfig.payment
      .runtimeRequirement !==
    "server"
  ) {
    throw new Error(
      "Payment runtime must execute on a trusted server.",
    );
  }
}

function assertPaymentReadyOrder(
  order:
    PreparedOrderDraft,
): asserts order is PreparedOrderDraft & {
  totalRial: number;
  paymentReady: true;
} {
  if (
    !order.paymentReady ||
    order.totalRial === null ||
    !Number.isSafeInteger(
      order.totalRial,
    ) ||
    order.totalRial < 0
  ) {
    throw new Error(
      "Order is not payment-ready.",
    );
  }
}

function assertAbsoluteCallbackUrl(
  callbackUrl: string,
): void {
  let parsed:
    URL;

  try {
    parsed =
      new URL(
        callbackUrl,
      );
  } catch {
    throw new Error(
      "Payment callback URL must be absolute.",
    );
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    throw new Error(
      "Payment callback URL must use HTTP or HTTPS.",
    );
  }
}

export interface BeginOrderPaymentInput {
  order:
    PreparedOrderDraft;

  repository:
    OrderRepository;

  gateway:
    PaymentGatewayAdapter;

  callbackUrl:
    string;

  description:
    string;
}

export interface BeginOrderPaymentResult {
  order:
    PendingOrderRecord;

  payment:
    PaymentRequestResult;
}

export async function beginOrderPayment(
  input:
    BeginOrderPaymentInput,
): Promise<BeginOrderPaymentResult> {
  assertPaymentRuntimeEnabled();

  assertPaymentReadyOrder(
    input.order,
  );

  assertAbsoluteCallbackUrl(
    input.callbackUrl,
  );

  const pendingOrder =
    await input.repository
      .createPending(
        input.order,
      );

  /*
   * The amount sent to the gateway comes
   * exclusively from the prepared server-side
   * order record.
   */
  const payment =
    await input.gateway
      .createPayment({
        orderId:
          pendingOrder.orderId,

        amountRial:
          pendingOrder.totalRial as number,

        currency:
          pendingOrder.currency,

        description:
          input.description,

        callbackUrl:
          input.callbackUrl,

        mobile:
          pendingOrder.customer.phone,
      });

  if (
    payment.provider !==
    commerceConfig.payment.provider
  ) {
    throw new Error(
      "Unexpected payment provider response.",
    );
  }

  const orderWithAuthority =
    await input.repository
      .attachAuthority({
        orderId:
          pendingOrder.orderId,

        authority:
          payment.authority,
      });

  return {
    order:
      orderWithAuthority,

    payment,
  };
}

export type VerifyOrderPaymentResult =
  | {
      status:
        "order-not-found";
    }
  | {
      status:
        "already-paid";

      order:
        PendingOrderRecord;
    }
  | {
      status:
        "failed";

      order:
        PendingOrderRecord;

      verification:
        PaymentVerificationResult;
    }
  | {
      status:
        "paid";

      order:
        PendingOrderRecord;

      verification:
        PaymentVerificationResult;
    };

export interface VerifyOrderPaymentInput {
  /*
   * Callback data supplies authority only.
   * Amount is intentionally absent.
   */
  authority:
    string;

  repository:
    OrderRepository;

  gateway:
    PaymentGatewayAdapter;

  paidAt:
    string;
}

export async function verifyOrderPayment(
  input:
    VerifyOrderPaymentInput,
): Promise<VerifyOrderPaymentResult> {
  assertPaymentRuntimeEnabled();

  const authority =
    input.authority.trim();

  if (!authority) {
    return {
      status:
        "order-not-found",
    };
  }

  const order =
    await input.repository
      .findByAuthority(
        authority,
      );

  if (!order) {
    return {
      status:
        "order-not-found",
    };
  }

  if (order.status === "paid") {
    return {
      status:
        "already-paid",

      order,
    };
  }

  assertPaymentReadyOrder(
    order,
  );

  /*
   * Verification amount comes from the
   * persisted pending order — never from
   * callback query parameters or the client.
   */
  const verification =
    await input.gateway
      .verifyPayment({
        orderId:
          order.orderId,

        authority:
          order.authority ??
          authority,

        amountRial:
          order.totalRial,

        currency:
          order.currency,
      });

  if (
    verification.provider !==
    commerceConfig.payment.provider
  ) {
    throw new Error(
      "Unexpected payment provider verification response.",
    );
  }

  if (
    verification.authority !==
    authority
  ) {
    throw new Error(
      "Payment authority mismatch.",
    );
  }

  if (
    verification.status ===
    "failed"
  ) {
    return {
      status:
        "failed",

      order,
      verification,
    };
  }

  const paidOrder =
    await input.repository
      .markPaid({
        orderId:
          order.orderId,

        authority,

        refId:
          verification.refId ??
          null,

        paidAt:
          input.paidAt,
      });

  return {
    status:
      "paid",

    order:
      paidOrder,

    verification,
  };
}
