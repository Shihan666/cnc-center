import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "reservation lifecycle keeps locked contracts",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/orders/reservation-repository.ts",
        "utf8",
      );

    assert.match(
      repository,
      /expireDueOrderReservations/,
    );

    assert.match(
      repository,
      /consumePaidOrderReservations/,
    );

    assert.match(
      repository,
      /releaseCancelledOrderReservations/,
    );

    assert.match(
      repository,
      /inventoryReservations/,
    );

    assert.match(
      repository,
      /inventoryMovements/,
    );

    assert.match(
      repository,
      /orderStatusHistory/,
    );

    assert.match(
      repository,
      /for\('update'\)/,
    );

    assert.match(
      repository,
      /status:\s*'expired'/,
    );

    assert.match(
      repository,
      /status:\s*'consumed'/,
    );

    assert.match(
      repository,
      /status:\s*'released'/,
    );

    assert.match(
      repository,
      /reservation_release/,
    );

    assert.match(
      repository,
      /lockedInventory/,
    );

    assert.match(
      repository,
      /reserved/,
    );

  },
);
