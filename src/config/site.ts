const developmentSiteUrl =
  "http://localhost:4321";

function resolveSiteUrl() {
  const configuredSiteUrl =
    import.meta.env.PUBLIC_SITE_URL?.trim();

  if (!configuredSiteUrl) {
    return developmentSiteUrl;
  }

  let parsedUrl: URL;

  try {
    parsedUrl =
      new URL(configuredSiteUrl);
  } catch {
    throw new Error(
      "PUBLIC_SITE_URL must be a valid absolute URL.",
    );
  }

  if (
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error(
      "PUBLIC_SITE_URL must use http or https.",
    );
  }

  if (
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "PUBLIC_SITE_URL must contain only the site origin, without a path, query, or hash.",
    );
  }

  return parsedUrl.origin;
}

const siteUrl =
  resolveSiteUrl();

export const siteConfig = {
  brand: {
    name: "CNC Center",
    shortName: "CNC Center",
    tagline: "مرکز تخصصی تعمیر و تأمین قطعات CNC",
    logo: "/images/brand/logo.svg",
  },

  contact: {
    primaryPhone: "",
    secondaryPhone: "",
    mobile: "",
    whatsapp: "",
    telegram: "",
    instagram: "",
    email: "",
  },

  location: {
    country: "ایران",
    province: "تهران",
    city: "تهران",
    address: "",
    serviceArea: "سراسر ایران",
  },

  businessHours: {
    saturdayToWednesday: "",
    thursday: "",
    friday: "",
  },

  seo: {
    defaultTitle: "CNC Center | تعمیر و تأمین قطعات CNC",
    defaultDescription:
      "مرکز تخصصی تعمیر دستگاه‌های CNC، تأمین قطعات، سروو، درایو، اسپیندل، کنترلر و تجهیزات CNC در سراسر ایران.",
    siteUrl,
    locale: "fa_IR",
    language: "fa",
  },

  social: {
    whatsappEnabled: true,
    telegramEnabled: true,
    instagramEnabled: true,
  },

  features: {
    onlinePurchase: true,
    priceInquiry: true,
    partSourcing: true,
    repairRequest: true,
    exactInventory: true,
    nationwideService: true,
  },
} as const;

export type SiteConfig = typeof siteConfig;
