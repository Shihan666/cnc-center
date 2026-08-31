import assert from 'node:assert/strict';

import {
  test,
} from 'node:test';

import {
  canAdminTransitionOrderStatus,
  getAdminOrderManualTransitions,
} from '../../src/server/orders/status-policy.ts';

test(
  'admin order status policy allows only forward operational transitions after payment',
  () => {
    for (
      const [
        fromStatus,
        toStatus,
      ] of [
        [
          'paid',
          'processing',
        ],
        [
          'processing',
          'ready_to_ship',
        ],
        [
          'ready_to_ship',
          'shipped',
        ],
        [
          'shipped',
          'completed',
        ],
      ]
    ) {
      assert.equal(
        canAdminTransitionOrderStatus(
          fromStatus,
          toStatus,
        ),
        true,
      );
    }
  },
);

test(
  'admin order status policy never allows manual payment ownership transitions',
  () => {
    for (
      const fromStatus of [
        'pending',
        'awaiting_payment',
        'paid',
        'processing',
        'ready_to_ship',
        'shipped',
        'completed',
        'cancelled',
        'expired',
      ]
    ) {
      assert.equal(
        canAdminTransitionOrderStatus(
          fromStatus,
          'paid',
        ),
        false,
      );
    }
  },
);

test(
  'admin order status policy rejects skips reversals no-ops and terminal transitions',
  () => {
    for (
      const [
        fromStatus,
        toStatus,
      ] of [
        [
          'paid',
          'ready_to_ship',
        ],
        [
          'processing',
          'paid',
        ],
        [
          'shipped',
          'processing',
        ],
        [
          'processing',
          'processing',
        ],
        [
          'completed',
          'processing',
        ],
        [
          'cancelled',
          'processing',
        ],
        [
          'expired',
          'processing',
        ],
        [
          'pending',
          'cancelled',
        ],
        [
          'awaiting_payment',
          'cancelled',
        ],
      ]
    ) {
      assert.equal(
        canAdminTransitionOrderStatus(
          fromStatus,
          toStatus,
        ),
        false,
      );
    }
  },
);

test(
  'admin order status policy exposes exact next manual statuses',
  () => {
    assert.deepEqual(
      getAdminOrderManualTransitions(
        'paid',
      ),
      [
        'processing',
      ],
    );

    assert.deepEqual(
      getAdminOrderManualTransitions(
        'processing',
      ),
      [
        'ready_to_ship',
      ],
    );

    assert.deepEqual(
      getAdminOrderManualTransitions(
        'ready_to_ship',
      ),
      [
        'shipped',
      ],
    );

    assert.deepEqual(
      getAdminOrderManualTransitions(
        'shipped',
      ),
      [
        'completed',
      ],
    );

    for (
      const status of [
        'pending',
        'awaiting_payment',
        'completed',
        'cancelled',
        'expired',
      ]
    ) {
      assert.deepEqual(
        getAdminOrderManualTransitions(
          status,
        ),
        [],
      );
    }
  },
);