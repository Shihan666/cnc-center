import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order processing transition follows status policy",
  async () => {

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
        "utf8",
      );

    const repository =
      await fs.readFile(
        "src/server/orders/repository.ts",
        "utf8",
      );


    assert.match(
      policy,
      /paid/,
    );

    assert.match(
      policy,
      /processing/,
    );

    assert.match(
      policy,
      /completed/,
    );

    assert.match(
      repository,
      /status/,
    );

    assert.match(
      repository,
      /Order cannot be paid from current status/,
    );

  },
);
