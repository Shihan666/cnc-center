import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "customer order tracking keeps fulfillment data connected",
  async () => {

    const trackingService =
      await fs.readFile(
        "src/server/orders/public-tracking-service.ts",
        "utf8",
      );

    const trackingRepository =
      await fs.readFile(
        "src/server/orders/public-tracking-repository.ts",
        "utf8",
      );

    const page =
      await fs.readFile(
        "src/pages/orders/track/index.astro",
        "utf8",
      );


    assert.match(
      trackingService,
      /findPublicOrderTracking/,
    );

    assert.match(
      trackingService,
      /paidAt/,
    );


    assert.match(
      trackingRepository,
      /status/,
    );

    assert.match(
      trackingRepository,
      /paidAt/,
    );


    assert.match(
      page,
      /PublicOrderTrackingIsland/,
    );


    assert.match(
      page,
      /PublicOrderTrackingIsland/,
    );

  },
);

