import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "customer tracking access keeps private order data protected",
  async () => {

    const api =
      await fs.readFile(
        "src/pages/api/orders/track.ts",
        "utf8",
      );

    const service =
      await fs.readFile(
        "src/server/orders/public-tracking-service.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/orders/public-tracking-repository.ts",
        "utf8",
      );


    assert.match(
      api,
      /getPublicOrderTracking/,
    );

    assert.match(
      api,
      /status/,
    );


    assert.match(
      service,
      /findPublicOrderTracking/,
    );

    assert.match(
      service,
      /paidAt/,
    );


    assert.match(
      repository,
      /orderNumber/,
    );

    assert.match(
      repository,
      /status/,
    );

    assert.match(
      repository,
      /paidAt/,
    );

  },
);

