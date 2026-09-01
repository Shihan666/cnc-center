import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADMIN_INVENTORY_MOVEMENT_TYPES,
  ADMIN_PRODUCT_COMMERCE_MODES,
  ADMIN_PRODUCT_CONDITIONS,
  ADMIN_PRODUCT_PRICE_VISIBILITIES,
  ADMIN_PRODUCT_SHIPPING_CLASSES,
  ADMIN_PRODUCT_STATUSES,
  isAdminInventoryMovementType,
  isAdminInventoryQuantityDelta,
  isAdminProductCommerceMode,
  isAdminProductCondition,
  isAdminProductId,
  isAdminProductPriceRial,
  isAdminProductPriceVisibility,
  isAdminProductShippingClass,
  isAdminProductStatus,
  isAdminProductUniqueViolation,
  normalizeAdminOptionalProductText,
  normalizeAdminProductText,
  parseAdjustAdminProductInventoryInput,
  parseCreateAdminProductInput,
  parseSetAdminProductPriceInput,
  parseUpdateAdminProductInput,
} from '../../src/server/products/admin-model.ts';

test('product administration enums match the database contract', () => {
  assert.deepEqual(
    ADMIN_PRODUCT_CONDITIONS,
    [
      'new',
      'used',
      'refurbished',
      'tested',
    ],
  );

  assert.deepEqual(
    ADMIN_PRODUCT_COMMERCE_MODES,
    [
      'direct-purchase',
      'price-inquiry',
      'sourcing-request',
    ],
  );

  assert.deepEqual(
    ADMIN_PRODUCT_PRICE_VISIBILITIES,
    [
      'visible',
      'hidden',
    ],
  );

  assert.deepEqual(
    ADMIN_PRODUCT_SHIPPING_CLASSES,
    [
      'standard',
      'fragile',
      'heavy',
      'pickup-only',
      'custom',
    ],
  );

  assert.deepEqual(
    ADMIN_PRODUCT_STATUSES,
    [
      'draft',
      'active',
      'archived',
    ],
  );

  assert.deepEqual(
    ADMIN_INVENTORY_MOVEMENT_TYPES,
    [
      'initial',
      'adjustment',
      'purchase',
      'sale',
      'return',
      'damage',
      'reservation_release',
    ],
  );
});

test('product administration enum guards accept only canonical values', () => {
  assert.equal(
    isAdminProductCondition('tested'),
    true,
  );
  assert.equal(
    isAdminProductCondition('broken'),
    false,
  );

  assert.equal(
    isAdminProductCommerceMode('direct-purchase'),
    true,
  );
  assert.equal(
    isAdminProductCommerceMode('direct'),
    false,
  );

  assert.equal(
    isAdminProductPriceVisibility('hidden'),
    true,
  );
  assert.equal(
    isAdminProductPriceVisibility('private'),
    false,
  );

  assert.equal(
    isAdminProductShippingClass('pickup-only'),
    true,
  );
  assert.equal(
    isAdminProductShippingClass('express'),
    false,
  );

  assert.equal(
    isAdminProductStatus('archived'),
    true,
  );
  assert.equal(
    isAdminProductStatus('deleted'),
    false,
  );

  assert.equal(
    isAdminInventoryMovementType('adjustment'),
    true,
  );
  assert.equal(
    isAdminInventoryMovementType('manual'),
    false,
  );
});

test('product id guard requires canonical UUID syntax', () => {
  assert.equal(
    isAdminProductId(
      '550e8400-e29b-41d4-a716-446655440000',
    ),
    true,
  );

  assert.equal(
    isAdminProductId(
      ' 550e8400-e29b-41d4-a716-446655440000 ',
    ),
    true,
  );

  assert.equal(
    isAdminProductId('not-a-uuid'),
    false,
  );

  assert.equal(
    isAdminProductId(
      '550e8400-e29b-01d4-a716-446655440000',
    ),
    false,
  );
});

test('product text normalization trims, collapses whitespace, and bounds length', () => {
  assert.equal(
    normalizeAdminProductText(
      '  Siemens   Servo \n Motor  ',
      100,
    ),
    'Siemens Servo Motor',
  );

  assert.equal(
    normalizeAdminProductText(
      'abcdef',
      4,
    ),
    'abcd',
  );

  assert.throws(
    () =>
      normalizeAdminProductText(
        'value',
        0,
      ),
    /positive safe integer/,
  );
});

test('optional product text converts empty normalized values to null', () => {
  assert.equal(
    normalizeAdminOptionalProductText(
      undefined,
      100,
    ),
    null,
  );

  assert.equal(
    normalizeAdminOptionalProductText(
      null,
      100,
    ),
    null,
  );

  assert.equal(
    normalizeAdminOptionalProductText(
      '   ',
      100,
    ),
    null,
  );

  assert.equal(
    normalizeAdminOptionalProductText(
      '  Siemens  ',
      100,
    ),
    'Siemens',
  );
});

test('product price validation requires nonnegative safe integers', () => {
  assert.equal(
    isAdminProductPriceRial(0),
    true,
  );
  assert.equal(
    isAdminProductPriceRial(1_250_000),
    true,
  );
  assert.equal(
    isAdminProductPriceRial(-1),
    false,
  );
  assert.equal(
    isAdminProductPriceRial(1.5),
    false,
  );
  assert.equal(
    isAdminProductPriceRial(
      Number.MAX_SAFE_INTEGER + 1,
    ),
    false,
  );
});

test('inventory adjustment validation requires a nonzero safe integer', () => {
  assert.equal(
    isAdminInventoryQuantityDelta(5),
    true,
  );
  assert.equal(
    isAdminInventoryQuantityDelta(-5),
    true,
  );
  assert.equal(
    isAdminInventoryQuantityDelta(0),
    false,
  );
  assert.equal(
    isAdminInventoryQuantityDelta(1.5),
    false,
  );
  assert.equal(
    isAdminInventoryQuantityDelta(
      Number.MAX_SAFE_INTEGER + 1,
    ),
    false,
  );
});
test(
  'create-product parser normalizes and validates API input',
  () => {
    const parsed =
      parseCreateAdminProductInput({
        contentId: '  spindle   motor  ',
        sku: '  SKU-1  ',
        partNumber: '  PN-1  ',
        name: '  Servo   Motor  ',
        brand: '  Fanuc  ',
        manufacturer: '  Fanuc   Ltd  ',
        condition: 'new',
        commerceMode: 'direct-purchase',
        priceVisibility: 'visible',
        shippingClass: 'standard',
        status: 'draft',
        priceRial: 120000,
      });

    assert.deepEqual(
      parsed,
      {
        contentId: 'spindle motor',
        sku: 'SKU-1',
        partNumber: 'PN-1',
        name: 'Servo Motor',
        brand: 'Fanuc',
        manufacturer: 'Fanuc Ltd',
        condition: 'new',
        commerceMode: 'direct-purchase',
        priceVisibility: 'visible',
        shippingClass: 'standard',
        status: 'draft',
        priceRial: 120000,
      },
    );

    assert.equal(
      parseCreateAdminProductInput({
        contentId: '',
        partNumber: 'PN-1',
        name: 'Servo Motor',
        brand: 'Fanuc',
        condition: 'new',
        commerceMode: 'direct-purchase',
        priceVisibility: 'visible',
        shippingClass: 'standard',
        status: 'draft',
      }),
      null,
    );

    assert.equal(
      parseCreateAdminProductInput({
        contentId: 'motor',
        partNumber: 'PN-1',
        name: 'Servo Motor',
        brand: 'Fanuc',
        condition: 'invalid',
        commerceMode: 'direct-purchase',
        priceVisibility: 'visible',
        shippingClass: 'standard',
        status: 'draft',
      }),
      null,
    );

    assert.equal(
      parseCreateAdminProductInput({
        contentId: 'motor',
        partNumber: 'PN-1',
        name: 'Servo Motor',
        brand: 'Fanuc',
        condition: 'new',
        commerceMode: 'direct-purchase',
        priceVisibility: 'visible',
        shippingClass: 'standard',
        status: 'draft',
        priceRial: -1,
      }),
      null,
    );
  },
);

test(
  'update-product parser excludes price and validates metadata',
  () => {
    const parsed =
      parseUpdateAdminProductInput({
        contentId: ' motor ',
        sku: null,
        partNumber: ' PN-2 ',
        name: ' Updated Motor ',
        brand: ' Fanuc ',
        manufacturer: '',
        condition: 'tested',
        commerceMode: 'price-inquiry',
        priceVisibility: 'hidden',
        shippingClass: 'heavy',
        status: 'active',
        priceRial: 999,
      });

    assert.deepEqual(
      parsed,
      {
        contentId: 'motor',
        sku: null,
        partNumber: 'PN-2',
        name: 'Updated Motor',
        brand: 'Fanuc',
        manufacturer: null,
        condition: 'tested',
        commerceMode: 'price-inquiry',
        priceVisibility: 'hidden',
        shippingClass: 'heavy',
        status: 'active',
      },
    );

    assert.equal(
      parseUpdateAdminProductInput({
        contentId: 'motor',
        partNumber: 'PN-2',
        name: 'Updated Motor',
        brand: 'Fanuc',
        condition: 'tested',
        commerceMode: 'price-inquiry',
        priceVisibility: 'hidden',
        shippingClass: 'heavy',
        status: 'unknown',
      }),
      null,
    );
  },
);

test(
  'price and inventory parsers validate mutation inputs',
  () => {
    assert.deepEqual(
      parseSetAdminProductPriceInput({
        amountRial: 0,
      }),
      {
        amountRial: 0,
      },
    );

    assert.equal(
      parseSetAdminProductPriceInput({
        amountRial: -1,
      }),
      null,
    );

    assert.deepEqual(
      parseAdjustAdminProductInventoryInput({
        quantityDelta: 5,
        note: '  manual   receipt  ',
      }),
      {
        quantityDelta: 5,
        note: 'manual receipt',
      },
    );

    assert.deepEqual(
      parseAdjustAdminProductInventoryInput({
        quantityDelta: -2,
      }),
      {
        quantityDelta: -2,
        note: null,
      },
    );

    assert.equal(
      parseAdjustAdminProductInventoryInput({
        quantityDelta: 0,
      }),
      null,
    );
  },
);
test(
  'product parsers reject normalized text beyond application limits',
  () => {
    const validMetadata = {
      contentId: 'motor',
      sku: 'SKU-1',
      partNumber: 'PN-1',
      name: 'Servo Motor',
      brand: 'Fanuc',
      manufacturer: 'Fanuc',
      condition: 'new',
      commerceMode: 'direct-purchase',
      priceVisibility: 'visible',
      shippingClass: 'standard',
      status: 'draft',
    };

    assert.equal(
      parseCreateAdminProductInput({
        ...validMetadata,
        contentId: 'x'.repeat(501),
      }),
      null,
    );

    assert.equal(
      parseCreateAdminProductInput({
        ...validMetadata,
        sku: 'x'.repeat(201),
      }),
      null,
    );

    assert.equal(
      parseUpdateAdminProductInput({
        ...validMetadata,
        name: 'x'.repeat(501),
      }),
      null,
    );

    assert.equal(
      parseUpdateAdminProductInput({
        ...validMetadata,
        manufacturer: 'x'.repeat(501),
      }),
      null,
    );

    assert.equal(
      parseAdjustAdminProductInventoryInput({
        quantityDelta: 1,
        note: 'x'.repeat(501),
      }),
      null,
    );

    assert.notEqual(
      parseCreateAdminProductInput({
        ...validMetadata,
        contentId: `  ${'x'.repeat(500)}  `,
      }),
      null,
    );

    assert.notEqual(
      parseAdjustAdminProductInventoryInput({
        quantityDelta: 1,
        note: `  ${'x'.repeat(500)}  `,
      }),
      null,
    );
  },
);
test(
  'unique-violation helper recognizes PostgreSQL error code',
  () => {
    assert.equal(
      isAdminProductUniqueViolation({
        code: '23505',
      }),
      true,
    );

    assert.equal(
      isAdminProductUniqueViolation({
        cause: {
          code: '23505',
        },
      }),
      true,
    );

    assert.equal(
      isAdminProductUniqueViolation({
        code: '23503',
      }),
      false,
    );

    assert.equal(
      isAdminProductUniqueViolation({
        cause: {
          code: '23503',
        },
      }),
      false,
    );

    assert.equal(
      isAdminProductUniqueViolation(
        new Error('duplicate'),
      ),
      false,
    );

    assert.equal(
      isAdminProductUniqueViolation(null),
      false,
    );

    assert.equal(
      isAdminProductUniqueViolation('23505'),
      false,
    );
  },
);