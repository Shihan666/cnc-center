import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdminSettingsSnapshot,
} from '../../src/server/settings/read-model.ts';

const source = {
  brand: {
    name: 'CNC Center',
    shortName: 'CNC',
    tagline: 'Test tagline',
    logo: '/images/brand/logo.svg',
  },
  contact: {
    primaryPhone: '02100000000',
    secondaryPhone: '',
    mobile: '09120000000',
    whatsapp: '',
    telegram: '',
    instagram: '',
    email: 'info@example.test',
  },
  location: {
    country: 'ایران',
    province: 'تهران',
    city: 'تهران',
    address: 'Test address',
    serviceArea: 'سراسر ایران',
  },
  businessHours: {
    saturdayToWednesday:
      '08:00-17:00',
    thursday:
      '08:00-13:00',
    friday:
      '',
  },
  shippingMethods: [
    {
      id: 'test-shipping',
      label: 'ارسال آزمایشی',
      description:
        'روش ارسال آزمایشی',
      destinationScope:
        'nationwide',
      feeMode:
        'quote',
      requiresAddress: true,
      allowedShippingClasses: [
        'standard',
        'fragile',
      ],
    },
  ],
};

test(
  'settings snapshot exposes only the locked safe configuration shape',
  () => {
    const snapshot =
      createAdminSettingsSnapshot(
        source,
      );

    assert.deepEqual(
      Object.keys(snapshot).sort(),
      [
        'brand',
        'businessHours',
        'contact',
        'location',
        'shippingMethods',
      ],
    );

    assert.deepEqual(
      snapshot,
      {
        brand:
          source.brand,
        contact:
          source.contact,
        location:
          source.location,
        businessHours:
          source.businessHours,
        shippingMethods: [
          {
            id:
              'test-shipping',
            label:
              'ارسال آزمایشی',
            description:
              'روش ارسال آزمایشی',
            destinationScope:
              'nationwide',
            feeMode:
              'quote',
            requiresAddress:
              true,
            allowedShippingClasses: [
              'standard',
              'fragile',
            ],
          },
        ],
      },
    );
  },
);

test(
  'settings snapshot copies shipping class arrays instead of exposing source arrays',
  () => {
    const snapshot =
      createAdminSettingsSnapshot(
        source,
      );

    assert.notEqual(
      snapshot.shippingMethods[0]
        .allowedShippingClasses,
      source.shippingMethods[0]
        .allowedShippingClasses,
    );

    assert.deepEqual(
      snapshot.shippingMethods[0]
        .allowedShippingClasses,
      source.shippingMethods[0]
        .allowedShippingClasses,
    );
  },
);

test(
  'settings snapshot excludes payment, runtime, secret, SEO, social, and feature configuration',
  () => {
    const unsafeSource = {
      ...source,
      payment: {
        provider: 'zarinpal',
        callbackPath:
          '/payment/zarinpal/callback/',
        env: {
          merchantId:
            'ZARINPAL_MERCHANT_ID',
          sandbox:
            'ZARINPAL_SANDBOX',
        },
      },
      seo: {
        secret:
          'must-not-leak',
      },
      social: {
        internal:
          'must-not-leak',
      },
      features: {
        internal:
          'must-not-leak',
      },
    };

    const snapshot =
      createAdminSettingsSnapshot(
        unsafeSource,
      );

    const serialized =
      JSON.stringify(snapshot);

    for (const forbiddenText of [
      'zarinpal',
      'ZARINPAL_MERCHANT_ID',
      'ZARINPAL_SANDBOX',
      '/payment/zarinpal/callback/',
      'must-not-leak',
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
