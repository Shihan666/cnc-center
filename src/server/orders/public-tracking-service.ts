import {
  normalizeOrderPhone,
} from '../../lib/orders/prepare.ts';

import {
  findPublicOrderTracking,
} from './public-tracking-repository.ts';

export interface PublicOrderTrackingInput {
  orderNumber:
    unknown;

  phone:
    unknown;
}

export type PublicOrderTrackingResult =
  | {
      status:
        'found';

      order: {
        orderNumber:
          string;

        status:
          string;

        createdAt:
          Date;

        updatedAt:
          Date;

        paidAt:
          Date | null;
      };
    }
  | {
      status:
        'invalid_input';
    }
  | {
      status:
        'not_found';
    };

function normalizeOrderNumber(
  value:
    unknown,
): string {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toUpperCase()
    : '';
}

function isValidPublicOrderNumber(
  value:
    string,
): boolean {
  return /^CNC-\d{8}-[0-9A-F]{12}$/.test(
    value,
  );
}

function isValidPublicOrderPhone(
  value:
    string,
): boolean {
  return /^0\d{10}$/.test(
    value,
  );
}

export async function getPublicOrderTracking(
  input:
    PublicOrderTrackingInput,
): Promise<PublicOrderTrackingResult> {
  const orderNumber =
    normalizeOrderNumber(
      input.orderNumber,
    );

  const customerPhone =
    normalizeOrderPhone(
      typeof input.phone ===
        'string'
        ? input.phone
        : '',
    );

  if (
    !isValidPublicOrderNumber(
      orderNumber,
    ) ||
    !isValidPublicOrderPhone(
      customerPhone,
    )
  ) {
    return {
      status:
        'invalid_input',
    };
  }

  const order =
    await findPublicOrderTracking(
      orderNumber,
      customerPhone,
    );

  if (!order) {
    /*
     * Deliberately return one generic result for:
     * - unknown order number
     * - correct order number with wrong phone
     *
     * This prevents the public endpoint from
     * confirming whether an order number exists.
     */
    return {
      status:
        'not_found',
    };
  }

  return {
    status:
      'found',

    order,
  };
}