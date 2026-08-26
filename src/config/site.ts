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
    siteUrl: "http://localhost:4321",
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
