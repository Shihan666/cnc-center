import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

test(
  "order transition matrix keeps valid and invalid flows protected",
  async () => {

    const policy =
      await fs.readFile(
        "src/server/orders/status-policy.ts",
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
      policy,
      /paid:\s*\[/,
    );

    assert.match(
      policy,
      /processing:\s*\[/,
    );

    assert.match(
      policy,
      /completed:\s*\[/,
    );


    assert.doesNotMatch(
      policy,
      /completed[\s\S]*processing/,
    );


    assert.doesNotMatch(
      policy,
      /completed[\s\S]*paid/,
    );

  },
);
