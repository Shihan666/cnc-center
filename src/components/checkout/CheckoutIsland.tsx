import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  commerceConfig,
  type ShippingMethodId,
} from "../../config/commerce";

import {
  getEligibleShippingMethodsForCart,
  getShippingFeeRial,
  getShippingMethod,
  requiresShippingQuote,
} from "../../lib/commerce";

import {
  CART_UPDATED_EVENT,
  calculateResolvedCartSubtotalRial,
  dispatchCartUpdatedEvent,
  cartLinesToStorageItems,
  formatRialAmount,
  formatTomanFromRial,
  parseCartStorage,
  resolveCartLines,
  serializeCartStorage,
  type CartCatalogItem,
  type ResolvedCartLine,
} from "../../lib/cart";

interface Props {
  catalog: readonly CartCatalogItem[];
}

interface CreatedOrderSummary {
  orderNumber: string;
  status: string;
  createdAt: string;
  reservationExpiresAt: string;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeIranianDigits(
  value: string,
): string {
  const persianDigits = "Û°Û±Û²Û³Û´ÛµÛ¶Û·Û¸Û¹";
  const arabicDigits = "Ù Ù¡Ù¢Ù£Ù¤Ù¥Ù¦Ù§Ù¨Ù©";

  return value
    .replace(/[Û°-Û¹]/g, (digit) =>
      String(
        persianDigits.indexOf(digit),
      ),
    )
    .replace(/[Ù -Ù©]/g, (digit) =>
      String(
        arabicDigits.indexOf(digit),
      ),
    );
}

function normalizeIranPhone(
  value: string,
): string {
  let digits =
    normalizeIranianDigits(value)
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

function isValidIranPhone(
  value: string,
): boolean {
  return /^0\d{10}$/.test(
    normalizeIranPhone(value),
  );
}

export default function CheckoutIsland({
  catalog,
}: Props) {
  const [ready, setReady] =
    useState(false);

  const [lines, setLines] =
    useState<ResolvedCartLine[]>([]);

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [city, setCity] =
    useState("");

  const [address, setAddress] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [
    shippingMethodId,
    setShippingMethodId,
  ] =
    useState<ShippingMethodId | "">("");

  const [errors, setErrors] =
    useState<string[]>([]);

  const [reviewReady, setReviewReady] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [createdOrder, setCreatedOrder] =
    useState<CreatedOrderSummary | null>(
      null,
    );

  const markDirty =
    useCallback(() => {
      setReviewReady(false);
      setErrors([]);
    }, []);

  const syncCart =
    useCallback(
      (rawValue: string | null) => {
        const parsed =
          parseCartStorage(
            rawValue,
          );

        const resolved =
          resolveCartLines(
            parsed,
            catalog,
          );

        const normalizedItems =
          cartLinesToStorageItems(
            resolved,
          );

        if (
          normalizedItems.length === 0
        ) {
          if (rawValue !== null) {
            window.localStorage.removeItem(
              commerceConfig.cart.storageKey,
            );

            dispatchCartUpdatedEvent();
          }
        } else {
          const normalized =
            serializeCartStorage(
              normalizedItems,
            );

          if (rawValue !== normalized) {
            window.localStorage.setItem(
              commerceConfig.cart.storageKey,
              normalized,
            );

            dispatchCartUpdatedEvent();
          }
        }

        setLines(resolved);
        setReviewReady(false);
      },
      [catalog],
    );

  useEffect(() => {
    const storageKey =
      commerceConfig.cart.storageKey;

    syncCart(
      window.localStorage.getItem(
        storageKey,
      ),
    );

    setReady(true);

    const handleStorage =
      (event: StorageEvent) => {
        if (
          event.key !== storageKey
        ) {
          return;
        }

        syncCart(
          event.newValue,
        );
      };

    const handleCartUpdated =
      () => {
        syncCart(
          window.localStorage.getItem(
            storageKey,
          ),
        );
      };

    window.addEventListener(
      "storage",
      handleStorage,
    );

    window.addEventListener(
      CART_UPDATED_EVENT,
      handleCartUpdated,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage,
      );

      window.removeEventListener(
        CART_UPDATED_EVENT,
        handleCartUpdated,
      );
    };
  }, [syncCart]);

  const subtotalRial =
    useMemo(
      () =>
        calculateResolvedCartSubtotalRial(
          lines,
        ),
      [lines],
    );

  const eligibleShippingMethods =
    useMemo(
      () =>
        getEligibleShippingMethodsForCart(
          lines.map(
            (line) =>
              line.shippingClass,
          ),
          city,
        ),
      [lines, city],
    );

  useEffect(() => {
    if (!shippingMethodId) {
      return;
    }

    const stillEligible =
      eligibleShippingMethods.some(
        (method) =>
          method.id ===
          shippingMethodId,
      );

    if (!stillEligible) {
      setShippingMethodId("");
      setReviewReady(false);
    }
  }, [
    eligibleShippingMethods,
    shippingMethodId,
  ]);

  const destinationCityReady =
    city.trim().length >= 2;

  useEffect(() => {
    if (
      destinationCityReady ||
      !shippingMethodId
    ) {
      return;
    }

    setShippingMethodId("");
    setReviewReady(false);
  }, [
    destinationCityReady,
    shippingMethodId,
  ]);

  const selectedShippingMethod =
    shippingMethodId
      ? getShippingMethod(
          shippingMethodId,
        )
      : null;

  const shippingFeeRial =
    shippingMethodId
      ? getShippingFeeRial(
          shippingMethodId,
        )
      : null;

  const shippingQuoteRequired =
    shippingMethodId
      ? requiresShippingQuote(
          shippingMethodId,
        )
      : false;

  const finalTotalRial =
    shippingFeeRial === null
      ? null
      : subtotalRial +
        shippingFeeRial;

  async function createOrder() {
    if (
      submitting ||
      !reviewReady ||
      !shippingMethodId ||
      !selectedShippingMethod
    ) {
      return;
    }

    setSubmitting(true);
    setErrors([]);

    try {
      const response =
        await fetch(
          "/api/orders",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",
            },

            credentials:
              "same-origin",

            body:
              JSON.stringify({
                items:
                  lines.map(
                    (line) => ({
                      productId:
                        line.id,

                      quantity:
                        line.quantity,
                    }),
                  ),

                name:
                  name.trim(),

                phone:
                  normalizeIranPhone(
                    phone,
                  ),

                city:
                  city.trim(),

                address:
                  selectedShippingMethod
                    .requiresAddress
                      ? address.trim()
                      : "",

                shippingMethodId,

                notes:
                  notes.trim(),
              }),
          },
        );

      const body: unknown =
        await response.json();

      if (
        response.ok &&
        isRecord(body) &&
        body.ok === true &&
        isRecord(body.order) &&
        typeof body.order
          .orderNumber === "string" &&
        typeof body.order.status ===
          "string" &&
        typeof body.order.createdAt ===
          "string" &&
        typeof body.order
          .reservationExpiresAt ===
          "string"
      ) {
        const nextOrder:
          CreatedOrderSummary = {
            orderNumber:
              body.order.orderNumber,

            status:
              body.order.status,

            createdAt:
              body.order.createdAt,

            reservationExpiresAt:
              body.order
                .reservationExpiresAt,
          };

        window.localStorage.removeItem(
          commerceConfig.cart.storageKey,
        );

        dispatchCartUpdatedEvent();

        setCreatedOrder(
          nextOrder,
        );

        const paymentResponse =
          await fetch(
            "/api/orders/payment-start",
            {
              method:
                "POST",

              headers: {
                "content-type":
                  "application/json",
              },

              credentials:
                "same-origin",

              body:
                JSON.stringify({
                  orderId:
                    body.order.id,

                  amountRial:
                    finalTotalRial,

                  callbackUrl:
                    `${window.location.origin}/api/payments/zarinpal/`,

                  description:
                    "CNC Center Order Payment",
                }),
            },
          );

        const paymentBody =
          await paymentResponse.json();

        if (
          paymentResponse.ok &&
          isRecord(paymentBody) &&
          isRecord(paymentBody.payment) &&
          typeof paymentBody.payment.paymentUrl === "string"
        ) {
          window.location.href =
            paymentBody.payment.paymentUrl;

          return;
        }

        setErrors([
          "شروع پرداخت ناموفق بود.",
        ]);

        setLines([]);
        setReviewReady(false);

        return;
      }

      if (
        isRecord(body) &&
        body.reason ===
          "stock_unavailable"
      ) {
        setErrors([
          "Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÛŒÚ©ÛŒ Ø§Ø² Ú©Ø§Ù„Ø§Ù‡Ø§ ØªØºÛŒÛŒØ± Ú©Ø±Ø¯Ù‡ Ø§Ø³Øª. Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø±Ø§ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø¨Ø±Ø±Ø³ÛŒ Ú©Ù†ÛŒØ¯.",
        ]);
        setReviewReady(false);
        return;
      }

      if (
        isRecord(body) &&
        body.reason ===
          "commerce_changed"
      ) {
        setErrors([
          "Ù‚ÛŒÙ…Øª ÛŒØ§ Ø´Ø±Ø§ÛŒØ· ÙØ±ÙˆØ´ ÛŒÚ©ÛŒ Ø§Ø² Ú©Ø§Ù„Ø§Ù‡Ø§ ØªØºÛŒÛŒØ± Ú©Ø±Ø¯Ù‡ Ø§Ø³Øª. Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø±Ø§ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø¨Ø±Ø±Ø³ÛŒ Ú©Ù†ÛŒØ¯.",
        ]);
        setReviewReady(false);
        return;
      }

      if (
        isRecord(body) &&
        body.reason ===
          "invalid_order"
      ) {
        setErrors([
          "Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø³ÙØ§Ø±Ø´ Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª. Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ùˆ Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø±Ø§ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø¨Ø±Ø±Ø³ÛŒ Ú©Ù†ÛŒØ¯.",
        ]);
        setReviewReady(false);
        return;
      }

      setErrors([
        "Ø«Ø¨Øª Ø³ÙØ§Ø±Ø´ Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯. Ù„Ø·ÙØ§Ù‹ Ø¯ÙˆØ¨Ø§Ø±Ù‡ ØªÙ„Ø§Ø´ Ú©Ù†ÛŒØ¯.",
      ]);
    } catch {
      setErrors([
        "Ø§Ø±ØªØ¨Ø§Ø· Ø¨Ø§ Ø³Ø±ÙˆØ± Ø¨Ø±Ø§ÛŒ Ø«Ø¨Øª Ø³ÙØ§Ø±Ø´ Ø¨Ø±Ù‚Ø±Ø§Ø± Ù†Ø´Ø¯. Ù„Ø·ÙØ§Ù‹ Ø¯ÙˆØ¨Ø§Ø±Ù‡ ØªÙ„Ø§Ø´ Ú©Ù†ÛŒØ¯.",
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(
    event:
      SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const nextErrors:
      string[] = [];

    if (lines.length === 0) {
      nextErrors.push(
        "Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø®Ø§Ù„ÛŒ Ø§Ø³Øª ÛŒØ§ Ø§Ù‚Ù„Ø§Ù… Ø¢Ù† Ø¯ÛŒÚ¯Ø± Ù‚Ø§Ø¨Ù„ Ø®Ø±ÛŒØ¯ Ù†ÛŒØ³ØªÙ†Ø¯.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresName &&
      name.trim().length < 2
    ) {
      nextErrors.push(
        "Ù†Ø§Ù… Ùˆ Ù†Ø§Ù… Ø®Ø§Ù†ÙˆØ§Ø¯Ú¯ÛŒ Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresPhone &&
      !isValidIranPhone(phone)
    ) {
      nextErrors.push(
        "Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³ Ù…Ø¹ØªØ¨Ø± ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯Ø› Ù…Ø§Ù†Ù†Ø¯ 09121234567.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresCity &&
      city.trim().length < 2
    ) {
      nextErrors.push(
        "Ø´Ù‡Ø± Ù…Ù‚ØµØ¯ Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresShippingMethod &&
      !shippingMethodId
    ) {
      nextErrors.push(
        "ÛŒÚ© Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„ Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯.",
      );
    }

    if (
      shippingMethodId &&
      !eligibleShippingMethods.some(
        (method) =>
          method.id ===
          shippingMethodId,
      )
    ) {
      nextErrors.push(
        "Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„ Ø§Ù†ØªØ®Ø§Ø¨â€ŒØ´Ø¯Ù‡ Ø¨Ø±Ø§ÛŒ Ø§ÛŒÙ† Ø³Ø¨Ø¯ ÛŒØ§ Ø´Ù‡Ø± Ù…Ù‚ØµØ¯ Ù‚Ø§Ø¨Ù„ Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù†ÛŒØ³Øª.",
      );
    }

    if (
      selectedShippingMethod
        ?.requiresAddress &&
      address.trim().length < 8
    ) {
      nextErrors.push(
        "Ø¨Ø±Ø§ÛŒ Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„ Ø§Ù†ØªØ®Ø§Ø¨â€ŒØ´Ø¯Ù‡ØŒ Ø¢Ø¯Ø±Ø³ Ú©Ø§Ù…Ù„â€ŒØªØ±ÛŒ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯.",
      );
    }

    if (
      notes.trim().length > 1000
    ) {
      nextErrors.push(
        "ØªÙˆØ¶ÛŒØ­Ø§Øª Ø³ÙØ§Ø±Ø´ Ù†Ø¨Ø§ÛŒØ¯ Ø¨ÛŒØ´ØªØ± Ø§Ø² Û±Û°Û°Û° Ú©Ø§Ø±Ø§Ú©ØªØ± Ø¨Ø§Ø´Ø¯.",
      );
    }

    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      setReviewReady(false);

      window.requestAnimationFrame(
        () => {
          document
            .getElementById(
              "checkout-error-summary",
            )
            ?.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
        },
      );

      return;
    }

    setErrors([]);
    setReviewReady(true);

    window.requestAnimationFrame(
      () => {
        document
          .getElementById(
            "checkout-review",
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      },
    );
  }

  if (!ready) {
    return (
      <div className="rounded-panel border border-line bg-surface-raised p-8 text-center shadow-card">
        <p className="text-sm font-bold text-muted">
          Ø¯Ø± Ø­Ø§Ù„ Ø®ÙˆØ§Ù†Ø¯Ù† Ùˆ Ø§Ø¹ØªØ¨Ø§Ø±Ø³Ù†Ø¬ÛŒ Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯...
        </p>
      </div>
    );
  }

  if (createdOrder) {
    return (
      <section
        id="checkout-order-success"
        className="rounded-panel border border-green-200 bg-green-50 p-6 shadow-card md:p-10"
        aria-live="polite"
      >
        <p className="text-sm font-bold text-signal">
          Ø³ÙØ§Ø±Ø´ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø«Ø¨Øª Ø´Ø¯
        </p>

        <h2 className="mt-3 text-2xl font-black text-ink">
          Ø´Ù…Ø§Ø±Ù‡ Ø³ÙØ§Ø±Ø´:
          {" "}
          <span dir="ltr">
            {createdOrder.orderNumber}
          </span>
        </h2>

        <p className="mt-4 text-sm leading-8 text-muted">
          Ø³ÙØ§Ø±Ø´ Ø«Ø¨Øª Ø´Ø¯Ù‡ Ùˆ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§Ù„Ø§ Ø¨Ù‡â€ŒØµÙˆØ±Øª Ù…ÙˆÙ‚Øª Ø±Ø²Ø±Ùˆ Ø´Ø¯Ù‡ Ø§Ø³Øª.
          Ø¯Ø± Ø§ÛŒÙ† Ù…Ø±Ø­Ù„Ù‡ Ù‡ÛŒÚ† Ù¾Ø±Ø¯Ø§Ø®Øª Ø¢Ù†Ù„Ø§ÛŒÙ† Ø§Ù†Ø¬Ø§Ù… Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª.
        </p>

        <p className="mt-3 text-sm leading-7 text-muted">
          Ø¨Ø±Ø§ÛŒ Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ø¨Ø¹Ø¯ÛŒØŒ Ø´Ù…Ø§Ø±Ù‡ Ø³ÙØ§Ø±Ø´ Ùˆ Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³ Ø«Ø¨Øªâ€ŒØ´Ø¯Ù‡ Ø±Ø§ Ù†Ú¯Ù‡ Ø¯Ø§Ø±ÛŒØ¯.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/orders/track/"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Ù¾ÛŒÚ¯ÛŒØ±ÛŒ Ø³ÙØ§Ø±Ø´
          </a>

          <a
            href="/products/buy/"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface-raised px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface-soft"
          >
            Ø§Ø¯Ø§Ù…Ù‡ Ø®Ø±ÛŒØ¯
          </a>
        </div>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-surface-raised p-8 text-center shadow-card md:p-12">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-xl font-black text-brand-700"
          aria-hidden="true"
        >
          Û°
        </div>

        <h2 className="mt-5 text-xl font-black text-ink">
          Ú©Ø§Ù„Ø§ÛŒÛŒ Ø¨Ø±Ø§ÛŒ Checkout ÙˆØ¬ÙˆØ¯ Ù†Ø¯Ø§Ø±Ø¯
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-muted">
          Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø®Ø§Ù„ÛŒ Ø§Ø³Øª ÛŒØ§ Ù…Ø­ØµÙˆÙ„ Ø°Ø®ÛŒØ±Ù‡â€ŒØ´Ø¯Ù‡ Ø¯ÛŒÚ¯Ø± Ø®Ø±ÛŒØ¯ Ù…Ø³ØªÙ‚ÛŒÙ…ØŒ
          Ù‚ÛŒÙ…Øª Ù…Ø¹ØªØ¨Ø± ÛŒØ§ Ù…ÙˆØ¬ÙˆØ¯ÛŒ ÙØ¹Ø§Ù„ Ù†Ø¯Ø§Ø±Ø¯.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="/cart/"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Ø¨Ø§Ø²Ú¯Ø´Øª Ø¨Ù‡ Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯
          </a>

          <a
            href="/products/buy/"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface-raised px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface-soft"
          >
            Ù…Ø­ØµÙˆÙ„Ø§Øª Ø®Ø±ÛŒØ¯ Ù…Ø³ØªÙ‚ÛŒÙ…
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-panel border border-line bg-surface-raised p-5 shadow-card sm:p-7 md:p-8"
      >
        <div>
          <p className="text-sm font-bold text-brand-700">
            Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø®Ø±ÛŒØ¯Ø§Ø±
          </p>

          <h2 className="mt-2 text-2xl font-black text-ink">
            Ù…Ø´Ø®ØµØ§Øª ØªÙ…Ø§Ø³ Ùˆ ØªØ­ÙˆÛŒÙ„
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted">
            Ø§ÛŒÙ† Ø§Ø·Ù„Ø§Ø¹Ø§Øª ÙÙ‚Ø· Ø¨Ø±Ø§ÛŒ Ø¨Ø±Ø±Ø³ÛŒ Ù‡Ù…ÛŒÙ† Ø³ÙØ§Ø±Ø´ Ø§Ø³ØªÙØ§Ø¯Ù‡ Ù…ÛŒâ€ŒØ´ÙˆØ¯ Ùˆ Ø¯Ø±
            localStorage Ø³Ø¨Ø¯ Ø®Ø±ÛŒØ¯ Ø°Ø®ÛŒØ±Ù‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.
          </p>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-ink">
              Ù†Ø§Ù… Ùˆ Ù†Ø§Ù… Ø®Ø§Ù†ÙˆØ§Ø¯Ú¯ÛŒ
              <span className="mr-1 text-danger">
                *
              </span>
            </span>

            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => {
                setName(
                  event.target.value,
                );
                markDirty();
              }}
              placeholder="Ù…Ø«Ù„Ø§Ù‹ Ø¹Ù„ÛŒ Ø±Ø¶Ø§ÛŒÛŒ"
              className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-ink">
              Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³
              <span className="mr-1 text-danger">
                *
              </span>
            </span>

            <input
              type="tel"
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => {
                setPhone(
                  event.target.value,
                );
                markDirty();
              }}
              placeholder="09121234567"
              className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface px-4 py-3 text-left text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-ink">
              Ø´Ù‡Ø± Ù…Ù‚ØµØ¯
              <span className="mr-1 text-danger">
                *
              </span>
            </span>

            <input
              type="text"
              name="city"
              autoComplete="address-level2"
              value={city}
              onChange={(event) => {
                setCity(
                  event.target.value,
                );
                markDirty();
              }}
              placeholder="Ù…Ø«Ù„Ø§Ù‹ ØªÙ‡Ø±Ø§Ù†"
              className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>

        <div className="mt-8 border-t border-line pt-8">
          <p className="text-sm font-bold text-brand-700">
            Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„
          </p>

          <h2 className="mt-2 text-xl font-black text-ink">
            Ø±ÙˆØ´â€ŒÙ‡Ø§ÛŒ Ø³Ø§Ø²Ú¯Ø§Ø± Ø¨Ø§ Ù‡Ù…Ù‡ Ø§Ù‚Ù„Ø§Ù… Ø³Ø¨Ø¯
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted">
            Ø±ÙˆØ´â€ŒÙ‡Ø§ Ø¨Ø± Ø§Ø³Ø§Ø³ Ø´Ù‡Ø± Ù…Ù‚ØµØ¯ Ùˆ Shipping Class ØªÙ…Ø§Ù… Ù…Ø­ØµÙˆÙ„Ø§Øª
            Ø¯Ø§Ø®Ù„ Ø³Ø¨Ø¯ ÙÛŒÙ„ØªØ± Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.
          </p>

          {
            destinationCityReady &&
            eligibleShippingMethods.length > 0 ? (
              <div className="mt-5 grid gap-3">
                {
                  eligibleShippingMethods.map(
                    (method) => (
                      <label
                        key={method.id}
                        className={[
                          "flex cursor-pointer gap-3 rounded-control border p-4 transition",
                          shippingMethodId === method.id
                            ? "border-brand-400 bg-brand-50"
                            : "border-line bg-surface hover:border-brand-200",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="shippingMethod"
                          value={method.id}
                          checked={
                            shippingMethodId ===
                            method.id
                          }
                          onChange={() => {
                            setShippingMethodId(
                              method.id,
                            );
                            markDirty();
                          }}
                          className="mt-1 size-4 shrink-0 accent-brand-600"
                        />

                        <span className="min-w-0">
                          <span className="block text-sm font-black text-ink">
                            {method.label}
                          </span>

                          <span className="mt-1 block text-xs leading-6 text-muted">
                            {method.description}
                          </span>

                          <span className="mt-2 block text-xs font-bold text-brand-700">
                            {
                              method.feeMode ===
                              "free"
                                ? "Ù‡Ø²ÛŒÙ†Ù‡ Ø§Ø±Ø³Ø§Ù„: Ø±Ø§ÛŒÚ¯Ø§Ù†"
                                : "Ù‡Ø²ÛŒÙ†Ù‡ Ø§Ø±Ø³Ø§Ù„: Ù¾Ø³ Ø§Ø² Ø§Ø³ØªØ¹Ù„Ø§Ù… Ùˆ Ù‡Ù…Ø§Ù‡Ù†Ú¯ÛŒ"
                            }
                          </span>
                        </span>
                      </label>
                    ),
                  )
                }
              </div>
            ) : (
              <div className="mt-5 rounded-control border border-warning-200 bg-warning-50 p-4">
                <p className="text-sm font-black text-warning-800">
                  {
                    destinationCityReady
                      ? "Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„ Ø³Ø§Ø²Ú¯Ø§Ø± Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯"
                      : "Ø§Ø¨ØªØ¯Ø§ Ø´Ù‡Ø± Ù…Ù‚ØµØ¯ Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯"
                  }
                </p>

                <p className="mt-2 text-xs leading-6 text-warning-800">
                  {
                    destinationCityReady
                      ? "ØªØ±Ú©ÛŒØ¨ Ø§Ù‚Ù„Ø§Ù… Ø§ÛŒÙ† Ø³Ø¨Ø¯ Ø¨Ø±Ø§ÛŒ Ø´Ù‡Ø± Ù…Ù‚ØµØ¯ Ø§Ù†ØªØ®Ø§Ø¨â€ŒØ´Ø¯Ù‡ Ø¨Ù‡ Ù‡Ù…Ø§Ù‡Ù†Ú¯ÛŒ Ø¬Ø¯Ø§Ú¯Ø§Ù†Ù‡ Ù†ÛŒØ§Ø² Ø¯Ø§Ø±Ø¯."
                      : "Ø¨Ø±Ø§ÛŒ Ù†Ù…Ø§ÛŒØ´ Ø±ÙˆØ´â€ŒÙ‡Ø§ÛŒ Ø§Ø±Ø³Ø§Ù„ Ø³Ø§Ø²Ú¯Ø§Ø±ØŒ Ø§Ø¨ØªØ¯Ø§ Ø´Ù‡Ø± Ù…Ù‚ØµØ¯ Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯."
                  }
                </p>
              </div>
            )
          }
        </div>

        {
          selectedShippingMethod
            ?.requiresAddress && (
            <div className="mt-8 border-t border-line pt-8">
              <label className="block">
                <span className="text-sm font-bold text-ink">
                  Ø¢Ø¯Ø±Ø³ ØªØ­ÙˆÛŒÙ„
                  <span className="mr-1 text-danger">
                    *
                  </span>
                </span>

                <textarea
                  name="address"
                  autoComplete="street-address"
                  rows={4}
                  value={address}
                  onChange={(event) => {
                    setAddress(
                      event.target.value,
                    );
                    markDirty();
                  }}
                  placeholder="Ø®ÛŒØ§Ø¨Ø§Ù†ØŒ Ú©ÙˆÚ†Ù‡ØŒ Ù¾Ù„Ø§Ú©ØŒ ÙˆØ§Ø­Ø¯ Ùˆ Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù„Ø§Ø²Ù… Ø¨Ø±Ø§ÛŒ ØªØ­ÙˆÛŒÙ„"
                  className="mt-2 w-full resize-y rounded-control border border-line bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>
          )
        }

        <div className="mt-8 border-t border-line pt-8">
          <label className="block">
            <span className="text-sm font-bold text-ink">
              ØªÙˆØ¶ÛŒØ­Ø§Øª Ø³ÙØ§Ø±Ø´
            </span>

            <textarea
              name="notes"
              rows={5}
              maxLength={1000}
              value={notes}
              onChange={(event) => {
                setNotes(
                  event.target.value,
                );
                markDirty();
              }}
              placeholder="Ø²Ù…Ø§Ù† Ù…Ù†Ø§Ø³Ø¨ ØªÙ…Ø§Ø³ØŒ ØªÙˆØ¶ÛŒØ­ ØªØ­ÙˆÛŒÙ„ ÛŒØ§ Ù†Ú©ØªÙ‡â€ŒØ§ÛŒ Ú©Ù‡ Ø¨Ø§ÛŒØ¯ Ù‡Ù†Ú¯Ø§Ù… Ø¨Ø±Ø±Ø³ÛŒ Ø³ÙØ§Ø±Ø´ Ø¨Ø¯Ø§Ù†ÛŒÙ…."
              className="mt-2 w-full resize-y rounded-control border border-line bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />

            <span className="mt-2 block text-xs text-muted">
              Ø­Ø¯Ø§Ú©Ø«Ø± Û±Û°Û°Û° Ú©Ø§Ø±Ø§Ú©ØªØ±
            </span>
          </label>
        </div>

        {
          errors.length > 0 && (
            <div
              id="checkout-error-summary"
              className="mt-8 rounded-control border border-red-200 bg-red-50 p-4"
              role="alert"
              aria-live="polite"
            >
              <p className="font-black text-danger">
                Ø§Ø·Ù„Ø§Ø¹Ø§Øª Checkout Ù†ÛŒØ§Ø² Ø¨Ù‡ Ø§ØµÙ„Ø§Ø­ Ø¯Ø§Ø±Ø¯
              </p>

              <ul className="mt-3 list-disc space-y-2 pr-5 text-sm leading-7 text-red-800">
                {
                  errors.map(
                    (error) => (
                      <li key={error}>
                        {error}
                      </li>
                    ),
                  )
                }
              </ul>
            </div>
          )
        }

        <div className="mt-8 border-t border-line pt-6">
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand-600 px-6 py-3.5 text-base font-semibold leading-none text-white shadow-sm transition duration-200 ease-standard hover:bg-brand-700 active:bg-brand-800 sm:w-auto"
          >
            Ø¨Ø±Ø±Ø³ÛŒ Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø³ÙØ§Ø±Ø´
          </button>

          <p className="mt-3 text-xs leading-6 text-muted">
            Ø§ÛŒÙ† Ø¯Ú©Ù…Ù‡ Ø³ÙØ§Ø±Ø´ ÙˆØ§Ù‚Ø¹ÛŒ Ø±Ø§ Ø«Ø¨Øª Ù…ÛŒâ€ŒÚ©Ù†Ø¯ØŒ Ø§Ù…Ø§ ÙˆØ§Ø±Ø¯ Ø¯Ø±Ú¯Ø§Ù‡ Ù¾Ø±Ø¯Ø§Ø®Øª Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.
          </p>
        </div>
      </form>

      <aside className="rounded-panel border border-line bg-surface-raised p-5 shadow-card sm:p-6 xl:sticky xl:top-24">
        <p className="text-sm font-bold text-brand-700">
          Ø®Ù„Ø§ØµÙ‡ Ø³Ø¨Ø¯
        </p>

        <h2 className="mt-2 text-xl font-black text-ink">
          Ù…Ø¨Ù„Øº Ùˆ Ø§Ø±Ø³Ø§Ù„
        </h2>

        <div className="mt-5 space-y-4">
          {
            lines.map((line) => (
              <div
                key={line.id}
                className="border-b border-line pb-4 last:border-b-0 last:pb-0"
              >
                <a
                  href={line.href}
                  className="text-sm font-black text-ink transition hover:text-brand-700"
                >
                  {line.name}
                </a>

                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
                  <span>
                    ØªØ¹Ø¯Ø§Ø¯:
                    {" "}
                    {new Intl.NumberFormat(
                      "fa-IR",
                    ).format(
                      line.quantity,
                    )}
                  </span>

                  <span
                    dir="ltr"
                    className="font-bold"
                  >
                    {formatTomanFromRial(
                      line.lineTotalRial,
                    )}
                  </span>
                </div>
              </div>
            ))
          }
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-muted">
              Ø¬Ù…Ø¹ Ú©Ø§Ù„Ø§Ù‡Ø§
            </span>

            <strong
              dir="ltr"
              className="text-lg font-black text-ink"
            >
              {formatTomanFromRial(
                subtotalRial,
              )}
            </strong>
          </div>

          <p
            dir="ltr"
            className="mt-1 text-xs font-bold text-muted"
          >
            {formatRialAmount(
              subtotalRial,
            )}
          </p>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <p className="text-sm font-bold text-muted">
            Ù‡Ø²ÛŒÙ†Ù‡ Ø§Ø±Ø³Ø§Ù„
          </p>

          {
            !shippingMethodId ? (
              <p className="mt-2 text-sm font-black text-ink">
                Ù‡Ù†ÙˆØ² Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„ Ø§Ù†ØªØ®Ø§Ø¨ Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª
              </p>
            ) : shippingQuoteRequired ? (
              <p className="mt-2 text-sm font-black text-warning-800">
                Ù¾Ø³ Ø§Ø² Ø§Ø³ØªØ¹Ù„Ø§Ù… Ùˆ Ù‡Ù…Ø§Ù‡Ù†Ú¯ÛŒ ØªØ¹ÛŒÛŒÙ† Ù…ÛŒâ€ŒØ´ÙˆØ¯
              </p>
            ) : (
              <p
                dir="ltr"
                className="mt-2 text-sm font-black text-signal"
              >
                {formatRialAmount(
                  shippingFeeRial ?? 0,
                )}
              </p>
            )
          }
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <p className="text-sm font-bold text-muted">
            Ø¬Ù…Ø¹ Ù†Ù‡Ø§ÛŒÛŒ Ù‚Ø§Ø¨Ù„ Ù¾Ø±Ø¯Ø§Ø®Øª
          </p>

          {
            finalTotalRial === null ? (
              <p className="mt-2 text-sm font-black leading-7 text-warning-800">
                ØªØ§ ØªØ¹ÛŒÛŒÙ† Ù‚Ø·Ø¹ÛŒ Ù‡Ø²ÛŒÙ†Ù‡ Ø§Ø±Ø³Ø§Ù„ØŒ Ù…Ø¨Ù„Øº Ù†Ù‡Ø§ÛŒÛŒ Ù¾Ø±Ø¯Ø§Ø®Øª Ù…Ø­Ø§Ø³Ø¨Ù‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.
              </p>
            ) : (
              <>
                <p
                  dir="ltr"
                  className="mt-2 text-xl font-black text-ink"
                >
                  {formatTomanFromRial(
                    finalTotalRial,
                  )}
                </p>

                <p
                  dir="ltr"
                  className="mt-1 text-xs font-bold text-muted"
                >
                  {formatRialAmount(
                    finalTotalRial,
                  )}
                </p>
              </>
            )
          }
        </div>

        <div className="mt-6 rounded-control border border-brand-100 bg-brand-50 p-4">
          <p className="text-sm font-black text-brand-800">
            Ù‚ÛŒÙ…Øª Ùˆ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ù‚Ø§Ø¨Ù„ Ø§Ø¹ØªÙ…Ø§Ø¯
          </p>

          <p className="mt-2 text-xs leading-6 text-brand-800">
            Checkout Ø§Ù‚Ù„Ø§Ù… localStorage Ø±Ø§ Ø¯ÙˆØ¨Ø§Ø±Ù‡ Ø¨Ø§ Ú©Ø§ØªØ§Ù„ÙˆÚ¯ ÙØ¹Ø§Ù„ Ø³Ø§ÛŒØª
            ØªØ·Ø¨ÛŒÙ‚ Ù…ÛŒâ€ŒØ¯Ù‡Ø¯. Ù‚ÛŒÙ…ØªØŒ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ùˆ Shipping Class Ø§Ø² Ø¯Ø§Ø¯Ù‡ Ø°Ø®ÛŒØ±Ù‡â€ŒØ´Ø¯Ù‡
            Ù…Ø±ÙˆØ±Ú¯Ø± Ù¾Ø°ÛŒØ±ÙØªÙ‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆÙ†Ø¯.
          </p>
        </div>
      </aside>

      {
        reviewReady &&
        selectedShippingMethod && (
          <section
            id="checkout-review"
            className="xl:col-span-2 rounded-panel border border-brand-200 bg-brand-50 p-5 shadow-card sm:p-7"
            aria-live="polite"
          >
            <p className="text-sm font-bold text-brand-700">
              Ù¾ÛŒØ´â€ŒÙ†Ù…Ø§ÛŒØ´ Checkout
            </p>

            <h2 className="mt-2 text-2xl font-black text-ink">
              Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø¢Ù…Ø§Ø¯Ù‡ Ø¨Ø±Ø±Ø³ÛŒ Ù†Ù‡Ø§ÛŒÛŒ Ø§Ø³Øª
            </h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-bold text-muted">
                  Ø®Ø±ÛŒØ¯Ø§Ø±
                </p>

                <p className="mt-1 text-sm font-black text-ink">
                  {name.trim()}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-muted">
                  ØªÙ…Ø§Ø³
                </p>

                <p
                  dir="ltr"
                  className="mt-1 text-left text-sm font-black text-ink"
                >
                  {normalizeIranPhone(
                    phone,
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-muted">
                  Ø´Ù‡Ø±
                </p>

                <p className="mt-1 text-sm font-black text-ink">
                  {city.trim()}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-muted">
                  Ø±ÙˆØ´ Ø§Ø±Ø³Ø§Ù„
                </p>

                <p className="mt-1 text-sm font-black text-ink">
                  {selectedShippingMethod.label}
                </p>
              </div>
            </div>

            {
              selectedShippingMethod
                .requiresAddress && (
                <div className="mt-5">
                  <p className="text-xs font-bold text-muted">
                    Ø¢Ø¯Ø±Ø³ ØªØ­ÙˆÛŒÙ„
                  </p>

                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink">
                    {address.trim()}
                  </p>
                </div>
              )
            }

            {
              notes.trim() && (
                <div className="mt-5">
                  <p className="text-xs font-bold text-muted">
                    ØªÙˆØ¶ÛŒØ­Ø§Øª
                  </p>

                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink">
                    {notes.trim()}
                  </p>
                </div>
              )
            }

            <div className="mt-6 rounded-control border border-warning-200 bg-warning-50 p-4">
              <p className="text-sm font-black text-warning-800">
                Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø±Ø§ Ù‚Ø¨Ù„ Ø§Ø² Ø«Ø¨Øª Ù†Ù‡Ø§ÛŒÛŒ Ø¨Ø±Ø±Ø³ÛŒ Ú©Ù†ÛŒØ¯
              </p>

              <p className="mt-2 text-xs leading-6 text-warning-800">
                Ø¨Ø§ Ø«Ø¨Øª Ù†Ù‡Ø§ÛŒÛŒØŒ Ø³ÙØ§Ø±Ø´ ÙˆØ§Ù‚Ø¹ÛŒ Ø§ÛŒØ¬Ø§Ø¯ Ùˆ Ù…ÙˆØ¬ÙˆØ¯ÛŒ Ú©Ø§Ù„Ø§ Ù…ÙˆÙ‚ØªØ§Ù‹ Ø±Ø²Ø±Ùˆ Ù…ÛŒâ€ŒØ´ÙˆØ¯.
                Ù¾Ø±Ø¯Ø§Ø®Øª Ø¢Ù†Ù„Ø§ÛŒÙ† Ù‡Ù†ÙˆØ² ÙØ¹Ø§Ù„ Ù†ÛŒØ³Øª.
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  void createOrder();
                }}
                disabled={submitting}
                className="inline-flex min-h-12 items-center justify-center rounded-control bg-brand-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {
                  submitting
                    ? "Ø¯Ø± Ø­Ø§Ù„ Ø«Ø¨Øª Ø³ÙØ§Ø±Ø´..."
                    : "Ø«Ø¨Øª Ù†Ù‡Ø§ÛŒÛŒ Ø³ÙØ§Ø±Ø´"
                }
              </button>

              <p className="mt-3 text-xs leading-6 text-muted">
                Ø«Ø¨Øª Ø³ÙØ§Ø±Ø´ Ø¨Ù‡ Ù…Ø¹Ù†ÛŒ Ù¾Ø±Ø¯Ø§Ø®Øª Ù†ÛŒØ³Øª.
              </p>
            </div>
          </section>
        )
      }
    </div>
  );
}

