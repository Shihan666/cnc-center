import assert from "node:assert/strict";
import {
  test,
} from "node:test";

import {
  GET,
} from "../../src/pages/api/admin/orders/index.ts";

function createContext() {
  return {
    request:
      new Request(
        "http://localhost:4321/api/admin/orders",
        {
          method:
            "GET",
        },
      ),

    url:
      new URL(
        "http://localhost:4321/api/admin/orders",
      ),

    site:
      new URL(
        "http://localhost:4321",
      ),

    cookies: {
      get() {
        return undefined;
      },

      delete() {},
    },
  };
}

test(
  "admin orders API requires an admin session",
  async () => {
    const response =
      await GET(
        createContext(),
      );

    assert.equal(
      response.status,
      401,
    );

    const body =
      await response.json();

    assert.equal(
      body.ok,
      false,
    );

    assert.equal(
      body.reason,
      "invalid_session",
    );
  },
);
