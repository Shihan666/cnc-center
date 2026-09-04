import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";


test(
  "admin refund endpoints expose lifecycle actions",
  async () => {

    const processRoute =
      await fs.readFile(
        "src/pages/api/admin/refunds/[id]/process.ts",
        "utf8",
      );

    const completeRoute =
      await fs.readFile(
        "src/pages/api/admin/refunds/[id]/complete.ts",
        "utf8",
      );

    const failRoute =
      await fs.readFile(
        "src/pages/api/admin/refunds/[id]/fail.ts",
        "utf8",
      );


    assert.match(
      processRoute,
      /startRefundProcess/,
    );


    assert.match(
      completeRoute,
      /completeRefundProcess/,
    );


    assert.match(
      failRoute,
      /failRefundProcess/,
    );


    assert.match(
      processRoute,
      /resolveAdminApiSession/,
    );


    assert.match(
      completeRoute,
      /resolveAdminApiSession/,
    );


    assert.match(
      failRoute,
      /resolveAdminApiSession/,
    );


  },
);
