export interface AdminSettingsBrand {
  name: string;
  shortName: string;
  tagline: string;
  logo: string;
}

export interface AdminSettingsContact {
  primaryPhone: string;
  secondaryPhone: string;
  mobile: string;
  whatsapp: string;
  telegram: string;
  instagram: string;
  email: string;
}

export interface AdminSettingsLocation {
  country: string;
  province: string;
  city: string;
  address: string;
  serviceArea: string;
}

export interface AdminSettingsBusinessHours {
  saturdayToWednesday: string;
  thursday: string;
  friday: string;
}

export interface AdminSettingsShippingMethodSource {
  id: string;
  label: string;
  description: string;
  destinationScope: string;
  feeMode: string;
  requiresAddress: boolean;
  allowedShippingClasses:
    readonly string[];
}

export interface AdminSettingsSource {
  brand: AdminSettingsBrand;
  contact: AdminSettingsContact;
  location: AdminSettingsLocation;
  businessHours:
    AdminSettingsBusinessHours;
  shippingMethods:
    readonly AdminSettingsShippingMethodSource[];
}

export interface AdminSettingsShippingMethod {
  id: string;
  label: string;
  description: string;
  destinationScope: string;
  feeMode: string;
  requiresAddress: boolean;
  allowedShippingClasses: string[];
}

export interface AdminSettingsSnapshot {
  brand: AdminSettingsBrand;
  contact: AdminSettingsContact;
  location: AdminSettingsLocation;
  businessHours:
    AdminSettingsBusinessHours;
  shippingMethods:
    AdminSettingsShippingMethod[];
}

export function createAdminSettingsSnapshot(
  source: AdminSettingsSource,
): AdminSettingsSnapshot {
  return {
    brand: {
      name:
        source.brand.name,
      shortName:
        source.brand.shortName,
      tagline:
        source.brand.tagline,
      logo:
        source.brand.logo,
    },
    contact: {
      primaryPhone:
        source.contact.primaryPhone,
      secondaryPhone:
        source.contact.secondaryPhone,
      mobile:
        source.contact.mobile,
      whatsapp:
        source.contact.whatsapp,
      telegram:
        source.contact.telegram,
      instagram:
        source.contact.instagram,
      email:
        source.contact.email,
    },
    location: {
      country:
        source.location.country,
      province:
        source.location.province,
      city:
        source.location.city,
      address:
        source.location.address,
      serviceArea:
        source.location.serviceArea,
    },
    businessHours: {
      saturdayToWednesday:
        source.businessHours.saturdayToWednesday,
      thursday:
        source.businessHours.thursday,
      friday:
        source.businessHours.friday,
    },
    shippingMethods:
      source.shippingMethods.map(
        (method) => ({
          id:
            method.id,
          label:
            method.label,
          description:
            method.description,
          destinationScope:
            method.destinationScope,
          feeMode:
            method.feeMode,
          requiresAddress:
            method.requiresAddress,
          allowedShippingClasses:
            [...method.allowedShippingClasses],
        }),
      ),
  };
}
