import {
  siteConfig,
} from '../../config/site.ts';

import {
  shippingMethods,
} from '../../config/commerce.ts';

import {
  createAdminSettingsSnapshot,
  type AdminSettingsSnapshot,
} from './read-model.ts';

export function getAdminSettings(): AdminSettingsSnapshot {
  return createAdminSettingsSnapshot({
    brand:
      siteConfig.brand,
    contact:
      siteConfig.contact,
    location:
      siteConfig.location,
    businessHours:
      siteConfig.businessHours,
    shippingMethods,
  });
}
