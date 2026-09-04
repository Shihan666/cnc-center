import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "public order service keeps locked workflow contracts",
  async () => {

    const service =
      await fs.readFile(
        "src/server/orders/public-service.ts",
        "utf8",
      );

    assert.match(
      service,
      /PUBLIC_ORDER_RESERVATION_TTL_MS/,
    );

    assert.match(
      service,
      /expireDueOrderReservations/,
    );

    assert.match(
      service,
      /getCommerceProductsByContentIds/,
    );

    assert.match(
      service,
      /prepareOrderDraft/,
    );

    assert.match(
      service,
      /invalid_order/,
    );

    assert.match(
      service,
      /stock_unavailable/,
    );

    assert.match(
      service,
      /commerce_changed/,
    );

    assert.match(
      service,
      /reservationExpiresAt/,
    );

    assert.match(
      service,
      /createPublicPendingOrder/,
    );

    assert.match(
      service,
      /databaseIdByContentId/,
    );

    assert.match(
      service,
      /contentIdByDatabaseId/,
    );

  },
);
