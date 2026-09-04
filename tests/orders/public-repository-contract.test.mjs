import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "public order repository keeps locked reservation contracts",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/orders/public-repository.ts",
        "utf8",
      );

    assert.match(
      repository,
      /database\.transaction/,
    );

    assert.match(
      repository,
      /for\('update'\)/,
    );

    assert.match(
      repository,
      /inventoryReservations/,
    );

    assert.match(
      repository,
      /orderStatusHistory/,
    );

    assert.match(
      repository,
      /createPublicOrderNumber/,
    );

    assert.match(
      repository,
      /stock_unavailable/,
    );

    assert.match(
      repository,
      /commerce_changed/,
    );

    assert.match(
      repository,
      /validatePreparedOrder/,
    );

    assert.match(
      repository,
      /lockedInventory/,
    );

    assert.match(
      repository,
      /nextReserved/,
    );

    assert.match(
      repository,
      /reserved/,
    );

    assert.match(
      repository,
      /reservationExpiresAt/,
    );

    assert.match(
      repository,
      /orderItems/,
    );

    assert.match(
      repository,
      /orders/,
    );

  },
);
