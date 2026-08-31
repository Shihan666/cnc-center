import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveAdminApiSession,
} from '../../src/server/admin-api-session.ts';

function createCookieRecorder(
  sessionToken,
) {
  const getCalls = [];
  const deleteCalls = [];

  return {
    getCalls,
    deleteCalls,

    cookies: {
      get(
        name,
      ) {
        getCalls.push(
          name,
        );

        if (
          sessionToken ===
          undefined
        ) {
          return undefined;
        }

        return {
          value:
            sessionToken,
        };
      },

      delete(
        name,
        options,
      ) {
        deleteCalls.push({
          name,
          options,
        });
      },
    },
  };
}

test(
  'missing admin API session clears only the admin session cookie and returns null',
  async () => {
    const recorder =
      createCookieRecorder(
        undefined,
      );

    const resolved =
      await resolveAdminApiSession({
        cookies:
          recorder.cookies,

        site:
          new URL(
            'http://localhost:4321',
          ),
      });

    assert.equal(
      resolved,
      null,
    );

    assert.deepEqual(
      recorder.getCalls,
      [
        'cnc_admin_session',
      ],
    );

    assert.deepEqual(
      recorder.deleteCalls,
      [
        {
          name:
            'cnc_admin_session',

          options: {
            httpOnly: true,
            sameSite: 'strict',
            secure: false,
            path: '/',
          },
        },
      ],
    );
  },
);

test(
  'admin API session resolution fails closed before cookie access when site configuration is missing',
  async () => {
    const recorder =
      createCookieRecorder(
        undefined,
      );

    await assert.rejects(
      () =>
        resolveAdminApiSession({
          cookies:
            recorder.cookies,

          site:
            undefined,
        }),
      /site configuration/i,
    );

    assert.deepEqual(
      recorder.getCalls,
      [],
    );

    assert.deepEqual(
      recorder.deleteCalls,
      [],
    );
  },
);