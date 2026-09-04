import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getAdminSettings,
} from '../../src/server/settings/repository.ts';

test(
  'settings repository returns the safe config-backed admin snapshot',
  () => {
    const settings =
      getAdminSettings();

    assert.deepEqual(
      Object.keys(settings).sort(),
      [
        'brand',
        'businessHours',
        'contact',
        'location',
        'shippingMethods',
      ],
    );

    assert.equal(
      settings.brand.name,
      'CNC Center',
    );

    assert.equal(
      settings.location.country,
      'ایران',
    );

    assert.ok(
      settings.shippingMethods.length > 0,
    );

    for (const method of settings.shippingMethods) {
      assert.equal(
        typeof method.id,
        'string',
      );

      assert.equal(
        typeof method.label,
        'string',
      );

      assert.ok(
        Array.isArray(
          method.allowedShippingClasses,
        ),
      );
    }
  },
);

test(
  'settings repository never exposes payment runtime configuration',
  () => {
    const settings =
      getAdminSettings();

    const serialized =
      JSON.stringify(settings);

    for (const forbiddenText of [
      'zarinpal',
      'ZARINPAL_MERCHANT_ID',
      'ZARINPAL_SANDBOX',
      '/payment/zarinpal/callback/',
      'adapter-ready',
    ]) {
      assert.equal(
        serialized.includes(
          forbiddenText,
        ),
        false,
      );
    }
  },
);
