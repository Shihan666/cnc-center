import assert from 'node:assert/strict';

import {
  test,
} from 'node:test';

import {
  ADMIN_DASHBOARD_TIME_ZONE,
  getAdminDashboardTehranDayRange,
} from '../../src/server/dashboard/read-model.ts';

test(
  'dashboard uses Asia/Tehran as its authoritative reporting timezone',
  () => {
    assert.equal(
      ADMIN_DASHBOARD_TIME_ZONE,
      'Asia/Tehran',
    );
  },
);

test(
  'dashboard Tehran day range returns exact inclusive start and exclusive end',
  () => {
    const range =
      getAdminDashboardTehranDayRange(
        new Date(
          '2026-09-04T12:00:00.000Z',
        ),
      );

    assert.equal(
      range.start.toISOString(),
      '2026-09-03T20:30:00.000Z',
    );

    assert.equal(
      range.end.toISOString(),
      '2026-09-04T20:30:00.000Z',
    );
  },
);

test(
  'dashboard Tehran day range follows the Tehran calendar across UTC day boundaries',
  () => {
    const beforeTehranMidnight =
      getAdminDashboardTehranDayRange(
        new Date(
          '2026-09-03T20:29:59.999Z',
        ),
      );

    assert.equal(
      beforeTehranMidnight.start.toISOString(),
      '2026-09-02T20:30:00.000Z',
    );

    assert.equal(
      beforeTehranMidnight.end.toISOString(),
      '2026-09-03T20:30:00.000Z',
    );

    const atTehranMidnight =
      getAdminDashboardTehranDayRange(
        new Date(
          '2026-09-03T20:30:00.000Z',
        ),
      );

    assert.equal(
      atTehranMidnight.start.toISOString(),
      '2026-09-03T20:30:00.000Z',
    );

    assert.equal(
      atTehranMidnight.end.toISOString(),
      '2026-09-04T20:30:00.000Z',
    );
  },
);

test(
  'dashboard Tehran day range rejects invalid dates',
  () => {
    assert.throws(
      () =>
        getAdminDashboardTehranDayRange(
          new Date(Number.NaN),
        ),
      {
        name: 'RangeError',
      },
    );
  },
);
