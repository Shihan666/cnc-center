import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";

const apiPath =
  "src/pages/api/admin/products/[id]/inventory.ts";

test(
  "admin product inventory API keeps the locked session boundary",
  async () => {
    const source =
      await fs.readFile(
        apiPath,
        "utf8",
      );

    assert.match(
      source,
      /resolveAdminApiSession/,
    );

    assert.match(
      source,
      /invalid_session/,
    );

    assert.match(
      source,
      /adjustAdminProductInventory/,
    );

    assert.match(
      source,
      /inventory_conflict/,
    );

    assert.match(
      source,
      /export const POST/,
    );
  },
);
