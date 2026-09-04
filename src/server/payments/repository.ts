import {
  eq,
} from "drizzle-orm";

import {
  getDatabase,
} from "../db/client.ts";

import {
  payments,
} from "../db/schema.ts";

export interface CreatePaymentRecordInput {
  orderId: string;
  provider: "zarinpal";
  environment:
    | "sandbox"
    | "production";
  amountRial: number;
}

export async function createPaymentRecord(
  input: CreatePaymentRecordInput,
) {
  const database =
    getDatabase();

  const [payment] =
    await database
      .insert(
        payments,
      )
      .values({
        orderId:
          input.orderId,

        provider:
          input.provider,

        environment:
          input.environment,

        amountRial:
          input.amountRial,

        status:
          "created",
      })
      .returning();

  return payment;
}

export async function getPaymentByOrderId(
  orderId: string,
) {
  const database =
    getDatabase();

  const [payment] =
    await database
      .select()
      .from(
        payments,
      )
      .where(
        eq(
          payments.orderId,
          orderId,
        ),
      )
      .limit(1);

  return payment ?? null;
}

export async function updatePaymentAuthority(
  paymentId: string,
  authority: string,
) {
  const database =
    getDatabase();

  const [payment] =
    await database
      .update(
        payments,
      )
      .set({
        authority,
        status:
          "pending",
        requestedAt:
          new Date(),
      })
      .where(
        eq(
          payments.id,
          paymentId,
        ),
      )
      .returning();

  return payment ?? null;
}

export async function markPaymentPaid(
  paymentId: string,
  refId: string,
) {
  const database =
    getDatabase();

  const [payment] =
    await database
      .update(
        payments,
      )
      .set({
        status:
          "paid",

        refId,
      })
      .where(
        eq(
          payments.id,
          paymentId,
        ),
      )
      .returning();

  return payment ?? null;
}

export async function markPaymentFailed(
  paymentId: string,
  message?: string,
) {
  const database =
    getDatabase();

  const [payment] =
    await database
      .update(
        payments,
      )
      .set({
        status:
          "failed",

        providerMessage:
          message ?? null,
      })
      .where(
        eq(
          payments.id,
          paymentId,
        ),
      )
      .returning();

  return payment ?? null;
}


export async function markPaymentRefunded(
  paymentId: string,
) {
  const database =
    getDatabase();

  const [payment] =
    await database
      .update(
        payments,
      )
      .set({
        status:
          "refunded",
      })
      .where(
        eq(
          payments.id,
          paymentId,
        ),
      )
      .returning();

  return payment ?? null;
}
