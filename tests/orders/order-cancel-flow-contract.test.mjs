import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order cancel flow releases reservation and blocks invalid transitions",
  async () => {

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );

    const reservation =
      await fs.readFile(
        "src/server/orders/reservation-repository.ts",
        "utf8",
      );

    const adminRoute =
      await fs.readFile(
        "src/pages/api/admin/orders/[id]/status.ts",
        "utf8",
      );


    assert.match(
      policy,
      /cancelled/,
    );

    assert.match(
      reservation,
      /releaseCancelledOrderReservations/,
    );

    assert.match(
      reservation,
      /released/,
    );

    assert.match(
      adminRoute,
      /transitionAdminOrderStatus/,
    );

    assert.match(
      adminRoute,
      /invalid_transition/,
    );

  },
);
