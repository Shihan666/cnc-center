import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "customer order history keeps lifecycle data connected",
  async () => {

    const repository =
      await fs.readFile(
        "src/server/orders/public-repository.ts",
        "utf8",
      );

    const service =
      await fs.readFile(
        "src/server/orders/public-service.ts",
        "utf8",
      );

    const tracking =
      await fs.readFile(
        "src/server/orders/public-tracking-service.ts",
        "utf8",
      );


    assert.match(
      repository,
      /orderId/,
    );

    assert.match(
      repository,
      /status/,
    );

    assert.match(
      repository,
      /paidAt/,
    );


    assert.match(
      service,
      /status/,
    );


    assert.match(
      tracking,
      /findPublicOrderTracking/,
    );

    assert.match(
      tracking,
      /paidAt/,
    );

  },
);
