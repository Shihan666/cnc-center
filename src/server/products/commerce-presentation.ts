import type {
  CommerceProductState,
} from "./commerce-repository";

export interface CommercePresentation {
  conditionLabel: string;
  commerceModeLabel: string;
  commerceModeDescription: string;
  formattedPrice: string | null;
  inventoryLabel: string;
  directPurchaseEligible: boolean;
}

const conditionLabels: Record<
  CommerceProductState["condition"],
  string
> = {
  new: "نو",
  used: "کارکرده",
  refurbished: "بازسازی‌شده",
  tested: "تست‌شده",
};

const commerceModeLabels: Record<
  CommerceProductState["commerceMode"],
  string
> = {
  "direct-purchase": "خرید آنلاین",
  "price-inquiry": "استعلام قیمت",
  "sourcing-request": "درخواست تأمین",
};

const commerceModeDescriptions: Record<
  CommerceProductState["commerceMode"],
  string
> = {
  "direct-purchase":
    "این محصول دارای قیمت قابل نمایش است و مسیر خرید مستقیم برای آن فعال می‌شود.",

  "price-inquiry":
    "قیمت این محصول پس از بررسی موجودی و شرایط روز اعلام می‌شود.",

  "sourcing-request":
    "این قطعه بر اساس Part Number و مشخصات فنی از مسیر تأمین سفارشی بررسی می‌شود.",
};

function formatRialPrice(
  amountRial: number,
): string {
  const formatted =
    new Intl.NumberFormat(
      "fa-IR",
      {
        maximumFractionDigits: 0,
      },
    ).format(amountRial);

  return `${formatted} ریال`;
}

function formatInventoryLabel(
  state: CommerceProductState,
): string {
  if (state.available > 0) {
    const quantity =
      new Intl.NumberFormat(
        "fa-IR",
      ).format(state.available);

    return `موجودی: ${quantity} عدد`;
  }

  if (
    state.commerceMode ===
    "sourcing-request"
  ) {
    return "تأمین سفارشی";
  }

  return "ناموجود";
}

export function createCommercePresentation(
  state: CommerceProductState,
): CommercePresentation {
  const formattedPrice =
    state.priceVisibility === "visible" &&
    state.currentPriceRial !== null
      ? formatRialPrice(
          state.currentPriceRial,
        )
      : null;

  const directPurchaseEligible =
    state.status === "active" &&
    state.commerceMode ===
      "direct-purchase" &&
    state.priceVisibility ===
      "visible" &&
    state.currentPriceRial !== null &&
    state.available > 0;

  return {
    conditionLabel:
      conditionLabels[
        state.condition
      ],

    commerceModeLabel:
      commerceModeLabels[
        state.commerceMode
      ],

    commerceModeDescription:
      commerceModeDescriptions[
        state.commerceMode
      ],

    formattedPrice,

    inventoryLabel:
      formatInventoryLabel(state),

    directPurchaseEligible,
  };
}
