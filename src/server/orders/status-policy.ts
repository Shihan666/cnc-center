import type {
  AdminOrderStatus,
} from './read-model.ts';

export const ADMIN_ORDER_MANUAL_TRANSITIONS =
  {
    pending: [],
    awaiting_payment: [],
    paid: [
      'processing',
    ],
    processing: [
      'ready_to_ship',
    ],
    ready_to_ship: [
      'shipped',
    ],
    shipped: [
      'completed',
    ],
    completed: [],
    cancelled: [],
    expired: [],
  } as const satisfies Record<
    AdminOrderStatus,
    readonly AdminOrderStatus[]
  >;

export function getAdminOrderManualTransitions(
  status: AdminOrderStatus,
): readonly AdminOrderStatus[] {
  return ADMIN_ORDER_MANUAL_TRANSITIONS[
    status
  ];
}

export function canAdminTransitionOrderStatus(
  fromStatus: AdminOrderStatus,
  toStatus: AdminOrderStatus,
): boolean {
  return (
    getAdminOrderManualTransitions(
      fromStatus,
    ) as readonly AdminOrderStatus[]
  ).includes(
    toStatus,
  );
}