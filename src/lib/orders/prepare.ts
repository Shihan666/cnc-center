import {
  commerceConfig,
} from "../../config/commerce";

import {
  calculateLineTotalRial,
  getEligibleShippingMethodsForCart,
  getShippingFeeRial,
  getShippingMethod,
  requiresShippingQuote,
} from "../commerce";

import type {
  CartCatalogItem,
} from "../cart";

import type {
  CheckoutSubmissionInput,
  OrderPreparationError,
  PrepareOrderResult,
  PreparedOrderDraft,
  PreparedOrderLine,
} from "./types";

export interface PrepareOrderOptions {
  /*
   * A quote-based shipping fee may only be
   * supplied by trusted server-side shipping
   * logic. It is intentionally separate from
   * CheckoutSubmissionInput.
   */
  resolvedShippingFeeRial?:
    number | null;
}

function normalizeDigits(
  value: string,
): string {
  const persianDigits =
    "۰۱۲۳۴۵۶۷۸۹";

  const arabicDigits =
    "٠١٢٣٤٥٦٧٨٩";

  return value
    .replace(/[۰-۹]/g, (digit) =>
      String(
        persianDigits.indexOf(
          digit,
        ),
      ),
    )
    .replace(/[٠-٩]/g, (digit) =>
      String(
        arabicDigits.indexOf(
          digit,
        ),
      ),
    );
}

export function normalizeOrderPhone(
  value: string,
): string {
  let digits =
    normalizeDigits(value)
      .replace(/[^\d]/g, "");

  if (
    digits.startsWith("98") &&
    digits.length === 12
  ) {
    digits =
      `0${digits.slice(2)}`;
  }

  return digits;
}

function isValidOrderPhone(
  value: string,
): boolean {
  return /^0\d{10}$/.test(
    normalizeOrderPhone(value),
  );
}

function safeText(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isSafeNonNegativeInteger(
  value: number,
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function prepareOrderDraft(
  submission:
    CheckoutSubmissionInput,

  catalog:
    readonly CartCatalogItem[],

  options:
    PrepareOrderOptions = {},
): PrepareOrderResult {
  const errors:
    OrderPreparationError[] = [];

  const name =
    safeText(
      submission.name,
    );

  const phone =
    normalizeOrderPhone(
      safeText(
        submission.phone,
      ),
    );

  const city =
    safeText(
      submission.city,
    );

  const address =
    safeText(
      submission.address,
    );

  const notes =
    safeText(
      submission.notes,
    );

  if (name.length < 2) {
    errors.push({
      code:
        "invalid-name",

      message:
        "نام و نام خانوادگی معتبر الزامی است.",
    });
  }

  if (!isValidOrderPhone(phone)) {
    errors.push({
      code:
        "invalid-phone",

      message:
        "شماره تماس معتبر الزامی است.",
    });
  }

  if (city.length < 2) {
    errors.push({
      code:
        "invalid-city",

      message:
        "شهر مقصد معتبر الزامی است.",
    });
  }

  if (notes.length > 1000) {
    errors.push({
      code:
        "invalid-notes",

      message:
        "توضیحات سفارش نباید بیشتر از ۱۰۰۰ کاراکتر باشد.",
    });
  }

  const items =
    Array.isArray(
      submission.items,
    )
      ? submission.items
      : [];

  if (items.length === 0) {
    errors.push({
      code:
        "empty-cart",

      message:
        "سبد خرید خالی است.",
    });
  }

  if (
    items.length >
    commerceConfig.cart
      .maxDistinctItems
  ) {
    errors.push({
      code:
        "too-many-items",

      message:
        "تعداد اقلام متمایز سبد از حد مجاز بیشتر است.",
    });
  }

  const catalogById =
    new Map(
      catalog.map(
        (product) => [
          product.id,
          product,
        ],
      ),
    );

  const seenProductIds =
    new Set<string>();

  const lines:
    PreparedOrderLine[] = [];

  for (const item of items) {
    const productId =
      typeof item?.productId ===
      "string"
        ? item.productId.trim()
        : "";

    if (!productId) {
      errors.push({
        code:
          "invalid-item",

        message:
          "شناسه یکی از اقلام سفارش معتبر نیست.",
      });

      continue;
    }

    if (
      seenProductIds.has(
        productId,
      )
    ) {
      errors.push({
        code:
          "duplicate-product",

        productId,

        message:
          "یک محصول بیش از یک بار در ورودی سفارش تکرار شده است.",
      });

      continue;
    }

    seenProductIds.add(
      productId,
    );

    const product =
      catalogById.get(
        productId,
      );

    if (!product) {
      errors.push({
        code:
          "product-unavailable",

        productId,

        message:
          "محصول دیگر برای خرید مستقیم در کاتالوگ معتبر موجود نیست.",
      });

      continue;
    }

    const quantity =
      item.quantity;

    if (
      !Number.isSafeInteger(
        quantity,
      ) ||
      quantity < 1 ||
      quantity >
        commerceConfig.cart
          .maxQuantityPerLine ||
      quantity >
        product.stockQuantity
    ) {
      errors.push({
        code:
          "invalid-quantity",

        productId,

        message:
          "تعداد درخواست‌شده با موجودی فعلی محصول سازگار نیست.",
      });

      continue;
    }

    let lineTotalRial:
      number;

    try {
      lineTotalRial =
        calculateLineTotalRial({
          unitPrice:
            product.unitPriceRial,

          priceUnit:
            "rial",

          quantity,
        });
    } catch {
      errors.push({
        code:
          "amount-overflow",

        productId,

        message:
          "مبلغ این ردیف سفارش خارج از محدوده امن محاسبات است.",
      });

      continue;
    }

    lines.push({
      productId:
        product.id,

      name:
        product.name,

      brand:
        product.brand,

      partNumber:
        product.partNumber,

      quantity,

      unitPriceRial:
        product.unitPriceRial,

      lineTotalRial,

      shippingClass:
        product.shippingClass,
    });
  }

  const shippingMethod =
    getShippingMethod(
      submission.shippingMethodId,
    );

  if (!shippingMethod) {
    errors.push({
      code:
        "invalid-shipping-method",

      message:
        "روش ارسال انتخاب‌شده معتبر نیست.",
    });
  }

  if (
    shippingMethod &&
    lines.length > 0
  ) {
    const eligibleMethods =
      getEligibleShippingMethodsForCart(
        lines.map(
          (line) =>
            line.shippingClass,
        ),
        city,
      );

    const eligible =
      eligibleMethods.some(
        (method) =>
          method.id ===
          shippingMethod.id,
      );

    if (!eligible) {
      errors.push({
        code:
          "shipping-method-ineligible",

        message:
          "روش ارسال انتخاب‌شده با شهر مقصد یا اقلام سفارش سازگار نیست.",
      });
    }

    if (
      shippingMethod
        .requiresAddress &&
      address.length < 8
    ) {
      errors.push({
        code:
          "address-required",

        message:
          "برای روش ارسال انتخاب‌شده آدرس کامل الزامی است.",
      });
    }
  }

  let subtotalRial =
    0;

  for (const line of lines) {
    subtotalRial +=
      line.lineTotalRial;

    if (
      !Number.isSafeInteger(
        subtotalRial,
      )
    ) {
      errors.push({
        code:
          "amount-overflow",

        message:
          "جمع مبلغ سفارش خارج از محدوده امن محاسبات است.",
      });

      break;
    }
  }

  let shippingFeeRial:
    number | null =
      shippingMethod
        ? getShippingFeeRial(
            shippingMethod.id,
          )
        : null;

  if (
    shippingMethod &&
    requiresShippingQuote(
      shippingMethod.id,
    )
  ) {
    const resolvedFee =
      options
        .resolvedShippingFeeRial;

    if (
      resolvedFee !==
        undefined &&
      resolvedFee !==
        null
    ) {
      if (
        !isSafeNonNegativeInteger(
          resolvedFee,
        )
      ) {
        errors.push({
          code:
            "invalid-shipping-fee",

          message:
            "هزینه ارسال محاسبه‌شده توسط سرور معتبر نیست.",
        });
      } else {
        shippingFeeRial =
          resolvedFee;
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  if (!shippingMethod) {
    return {
      ok: false,

      errors: [
        {
          code:
            "invalid-shipping-method",

          message:
            "روش ارسال معتبر یافت نشد.",
        },
      ],
    };
  }

  let totalRial:
    number | null =
      null;

  if (
    shippingFeeRial !==
    null
  ) {
    const candidateTotal =
      subtotalRial +
      shippingFeeRial;

    if (
      !Number.isSafeInteger(
        candidateTotal,
      )
    ) {
      return {
        ok: false,

        errors: [
          {
            code:
              "amount-overflow",

            message:
              "جمع نهایی سفارش خارج از محدوده امن محاسبات است.",
          },
        ],
      };
    }

    totalRial =
      candidateTotal;
  }

  const paymentReady =
    totalRial !== null &&
    (
      !commerceConfig.checkout
        .paymentRequiresResolvedShippingFee ||
      shippingFeeRial !== null
    );

  const order:
    PreparedOrderDraft = {
      customer: {
        name,
        phone,
        city,
        address:
          shippingMethod
            .requiresAddress
              ? address
              : "",
        notes,
      },

      lines,

      shippingMethodId:
        shippingMethod.id,

      shippingMethodLabel:
        shippingMethod.label,

      subtotalRial,

      shippingFeeRial,

      totalRial,

      currency:
        commerceConfig.money
          .canonicalCurrency,

      paymentReady,
    };

  return {
    ok: true,
    order,
  };
}
