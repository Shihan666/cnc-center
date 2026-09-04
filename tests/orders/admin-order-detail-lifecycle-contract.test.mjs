import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "admin order detail keeps order payment and status data connected",
  async () => {

    const model =
      await fs.readFile(
        "src/server/orders/admin-detail-read-model.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/orders/repository.ts",
        "utf8",
      );


    assert.match(
      model,
      /status/,
    );

    assert.match(
      model,
      /paidAt/,
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
      repository,
      /orderId/,
    );

  },
);
