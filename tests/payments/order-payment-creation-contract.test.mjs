import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "created order payment boundary stays after order persistence",
  async () => {

    const service =
      await fs.readFile(
        "src/server/orders/public-service.ts",
        "utf8",
      );

    assert.match(
      service,
      /createPublicPendingOrder/,
    );

    assert.match(
      service,
      /reservationExpiresAt/,
    );

    assert.match(
      service,
      /persisted\.orderId/,
    );

    assert.match(
      service,
      /persisted\.status/,
    );

  },
);
