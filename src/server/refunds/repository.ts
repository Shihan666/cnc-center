import {
  and,
  eq,
} from "drizzle-orm";

import {
  getDatabase,
} from "../db/client.ts";

import {
  refunds,
} from "../db/schema.ts";


export interface CreateRefundInput {
  orderId:
    string;

  paymentId:
    string;

  amountRial:
    number;

  reason?:
    string;
}


export async function createRefund(
  input: CreateRefundInput,
) {
  const database =
    getDatabase();

  const [refund] =
    await database
      .insert(
        refunds,
      )
      .values({
        orderId:
          input.orderId,

        paymentId:
          input.paymentId,

        amountRial:
          input.amountRial,

        reason:
          input.reason ?? null,

        status:
          "requested",
      })
      .returning();

  return refund;
}


export async function getRefundsByOrderId(
  orderId: string,
) {
  const database =
    getDatabase();

  return database
    .select()
    .from(
      refunds,
    )
    .where(
      eq(
        refunds.orderId,
        orderId,
      ),
    );
}


export async function updateRefundStatus(
  refundId: string,
  status:
    | "requested"
    | "processing"
    | "completed"
    | "failed",
) {
  const database =
    getDatabase();

  const [refund] =
    await database
      .update(
        refunds,
      )
      .set({
        status,

        completedAt:
          status === "completed"
            ? new Date()
            : null,
      })
      .where(
        eq(
          refunds.id,
          refundId,
        ),
      )
      .returning();

  return refund ?? null;
}
