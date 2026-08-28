export type CommerceMoneyUnit =
  | "toman"
  | "rial";

export type CanonicalCommerceCurrency =
  "IRR";

export type CommerceShippingClass =
  | "standard"
  | "fragile"
  | "heavy"
  | "pickup-only"
  | "custom";

export type ShippingMethodId =
  | "tehran-courier"
  | "tipax"
  | "iran-post"
  | "freight"
  | "pickup";

export type ShippingDestinationScope =
  | "tehran-only"
  | "nationwide"
  | "pickup";

export type ShippingFeeMode =
  | "free"
  | "quote";

export interface ShippingMethodDefinition {
  id: ShippingMethodId;
  label: string;
  description: string;

  destinationScope:
    ShippingDestinationScope;

  feeMode:
    ShippingFeeMode;

  requiresAddress: boolean;

  allowedShippingClasses:
    readonly CommerceShippingClass[];
}

export const shippingMethods = [
  {
    id: "tehran-courier",
    label: "پیک تهران",
    description:
      "ارسال داخل تهران با پیک پس از تأیید سفارش و هماهنگی زمان تحویل.",

    destinationScope:
      "tehran-only",

    feeMode:
      "quote",

    requiresAddress: true,

    allowedShippingClasses: [
      "standard",
      "fragile",
    ],
  },

  {
    id: "tipax",
    label: "تیپاکس",
    description:
      "ارسال قطعات استاندارد و برخی اقلام حساس به شهرهای تحت پوشش تیپاکس.",

    destinationScope:
      "nationwide",

    feeMode:
      "quote",

    requiresAddress: true,

    allowedShippingClasses: [
      "standard",
      "fragile",
    ],
  },

  {
    id: "iran-post",
    label: "پست جمهوری اسلامی ایران",
    description:
      "ارسال اقلام استاندارد قابل پذیرش در شبکه پستی.",

    destinationScope:
      "nationwide",

    feeMode:
      "quote",

    requiresAddress: true,

    allowedShippingClasses: [
      "standard",
    ],
  },

  {
    id: "freight",
    label: "باربری",
    description:
      "ارسال تجهیزات سنگین، حساس یا سفارشی پس از هماهنگی روش حمل.",

    destinationScope:
      "nationwide",

    feeMode:
      "quote",

    requiresAddress: true,

    allowedShippingClasses: [
      "fragile",
      "heavy",
      "custom",
    ],
  },

  {
    id: "pickup",
    label: "تحویل حضوری",
    description:
      "تحویل حضوری سفارش پس از تأیید آماده‌بودن کالا و هماهنگی قبلی.",

    destinationScope:
      "pickup",

    feeMode:
      "free",

    requiresAddress: false,

    allowedShippingClasses: [
      "standard",
      "fragile",
      "heavy",
      "pickup-only",
      "custom",
    ],
  },
] as const satisfies
  readonly ShippingMethodDefinition[];

export const commerceConfig = {
  money: {
    canonicalCurrency:
      "IRR" as CanonicalCommerceCurrency,

    defaultDisplayUnit:
      "toman" as CommerceMoneyUnit,

    tomanToRialMultiplier: 10,
  },

  cart: {
    storageKey:
      "cnc-center-cart-v1",

    maxDistinctItems: 100,

    maxQuantityPerLine: 999,
  },

  checkout: {
    requiresName: true,
    requiresPhone: true,
    requiresCity: true,
    requiresShippingMethod: true,

    paymentRequiresResolvedShippingFee:
      true,
  },

  payment: {
    provider: "zarinpal",

    integrationState:
      "adapter-ready",

    runtimeRequirement:
      "server",

    productionEnabled: false,

    gatewayAmountCurrency:
      "IRR" as CanonicalCommerceCurrency,

    callbackPath:
      "/payment/zarinpal/callback/",

    env: {
      merchantId:
        "ZARINPAL_MERCHANT_ID",

      sandbox:
        "ZARINPAL_SANDBOX",
    },
  },
} as const;
