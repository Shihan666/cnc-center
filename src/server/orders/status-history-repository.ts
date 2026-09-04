import {
  getDatabase,
} from "../db/client.ts";

import {
  orderStatusHistory,
} from "../db/schema.ts";


export interface CreateOrderHistoryInput {
  orderId:
    string;

  status:
    string;

  referenceType?:
    string;

  referenceId?:
    string;

  note?:
    string;
}


export async function createOrderStatusHistory(
  input: CreateOrderHistoryInput,
) {
  const database =
    getDatabase();

  const [history] =
    await database
      .insert(
        orderStatusHistory,
      )
      .values({
        orderId:
          input.orderId,

        status:
          input.status as any,

        referenceType:
          input.referenceType ?? null,

        referenceId:
          input.referenceId ?? null,

        note:
          input.note ?? null,
      })
      .returning();

  return history;
}
