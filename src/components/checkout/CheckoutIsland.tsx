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

function normalizeIranianDigits(
  value: string,
): string {
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

  return value
    .replace(/[۰-۹]/g, (digit) =>
      String(
        persianDigits.indexOf(digit),
      ),
    )
    .replace(/[٠-٩]/g, (digit) =>
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

  function handleSubmit(
    event:
      SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const nextErrors:
      string[] = [];

    if (lines.length === 0) {
      nextErrors.push(
        "سبد خرید خالی است یا اقلام آن دیگر قابل خرید نیستند.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresName &&
      name.trim().length < 2
    ) {
      nextErrors.push(
        "نام و نام خانوادگی را وارد کنید.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresPhone &&
      !isValidIranPhone(phone)
    ) {
      nextErrors.push(
        "شماره تماس معتبر وارد کنید؛ مانند 09121234567.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresCity &&
      city.trim().length < 2
    ) {
      nextErrors.push(
        "شهر مقصد را وارد کنید.",
      );
    }

    if (
      commerceConfig.checkout
        .requiresShippingMethod &&
      !shippingMethodId
    ) {
      nextErrors.push(
        "یک روش ارسال انتخاب کنید.",
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
        "روش ارسال انتخاب‌شده برای این سبد یا شهر مقصد قابل استفاده نیست.",
      );
    }

    if (
      selectedShippingMethod
        ?.requiresAddress &&
      address.trim().length < 8
    ) {
      nextErrors.push(
        "برای روش ارسال انتخاب‌شده، آدرس کامل‌تری وارد کنید.",
      );
    }

    if (
      notes.trim().length > 1000
    ) {
      nextErrors.push(
        "توضیحات سفارش نباید بیشتر از ۱۰۰۰ کاراکتر باشد.",
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
          در حال خواندن و اعتبارسنجی سبد خرید...
        </p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-surface-raised p-8 text-center shadow-card md:p-12">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-xl font-black text-brand-700"
          aria-hidden="true"
        >
          ۰
        </div>

        <h2 className="mt-5 text-xl font-black text-ink">
          کالایی برای Checkout وجود ندارد
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-muted">
          سبد خرید خالی است یا محصول ذخیره‌شده دیگر خرید مستقیم،
          قیمت معتبر یا موجودی فعال ندارد.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="/cart/"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            بازگشت به سبد خرید
          </a>

          <a
            href="/products/buy/"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface-raised px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface-soft"
          >
            محصولات خرید مستقیم
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
            اطلاعات خریدار
          </p>

          <h2 className="mt-2 text-2xl font-black text-ink">
            مشخصات تماس و تحویل
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted">
            این اطلاعات فقط برای بررسی همین سفارش استفاده می‌شود و در
            localStorage سبد خرید ذخیره نمی‌شود.
          </p>
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-ink">
              نام و نام خانوادگی
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
              placeholder="مثلاً علی رضایی"
              className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-ink">
              شماره تماس
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
              شهر مقصد
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
              placeholder="مثلاً تهران"
              className="mt-2 min-h-11 w-full rounded-control border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>

        <div className="mt-8 border-t border-line pt-8">
          <p className="text-sm font-bold text-brand-700">
            روش ارسال
          </p>

          <h2 className="mt-2 text-xl font-black text-ink">
            روش‌های سازگار با همه اقلام سبد
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted">
            روش‌ها بر اساس شهر مقصد و Shipping Class تمام محصولات
            داخل سبد فیلتر می‌شوند.
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
                                ? "هزینه ارسال: رایگان"
                                : "هزینه ارسال: پس از استعلام و هماهنگی"
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
                      ? "روش ارسال سازگار پیدا نشد"
                      : "ابتدا شهر مقصد را وارد کنید"
                  }
                </p>

                <p className="mt-2 text-xs leading-6 text-warning-800">
                  {
                    destinationCityReady
                      ? "ترکیب اقلام این سبد برای شهر مقصد انتخاب‌شده به هماهنگی جداگانه نیاز دارد."
                      : "برای نمایش روش‌های ارسال سازگار، ابتدا شهر مقصد را وارد کنید."
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
                  آدرس تحویل
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
                  placeholder="خیابان، کوچه، پلاک، واحد و اطلاعات لازم برای تحویل"
                  className="mt-2 w-full resize-y rounded-control border border-line bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </label>
            </div>
          )
        }

        <div className="mt-8 border-t border-line pt-8">
          <label className="block">
            <span className="text-sm font-bold text-ink">
              توضیحات سفارش
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
              placeholder="زمان مناسب تماس، توضیح تحویل یا نکته‌ای که باید هنگام بررسی سفارش بدانیم."
              className="mt-2 w-full resize-y rounded-control border border-line bg-surface px-4 py-3 text-sm leading-7 text-ink outline-none transition placeholder:text-muted focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />

            <span className="mt-2 block text-xs text-muted">
              حداکثر ۱۰۰۰ کاراکتر
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
                اطلاعات Checkout نیاز به اصلاح دارد
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
            بررسی اطلاعات سفارش
          </button>

          <p className="mt-3 text-xs leading-6 text-muted">
            این دکمه سفارش واقعی ثبت نمی‌کند و وارد درگاه پرداخت نمی‌شود.
          </p>
        </div>
      </form>

      <aside className="rounded-panel border border-line bg-surface-raised p-5 shadow-card sm:p-6 xl:sticky xl:top-24">
        <p className="text-sm font-bold text-brand-700">
          خلاصه سبد
        </p>

        <h2 className="mt-2 text-xl font-black text-ink">
          مبلغ و ارسال
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
                    تعداد:
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
              جمع کالاها
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
            هزینه ارسال
          </p>

          {
            !shippingMethodId ? (
              <p className="mt-2 text-sm font-black text-ink">
                هنوز روش ارسال انتخاب نشده است
              </p>
            ) : shippingQuoteRequired ? (
              <p className="mt-2 text-sm font-black text-warning-800">
                پس از استعلام و هماهنگی تعیین می‌شود
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
            جمع نهایی قابل پرداخت
          </p>

          {
            finalTotalRial === null ? (
              <p className="mt-2 text-sm font-black leading-7 text-warning-800">
                تا تعیین قطعی هزینه ارسال، مبلغ نهایی پرداخت محاسبه نمی‌شود.
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
            قیمت و موجودی قابل اعتماد
          </p>

          <p className="mt-2 text-xs leading-6 text-brand-800">
            Checkout اقلام localStorage را دوباره با کاتالوگ فعال سایت
            تطبیق می‌دهد. قیمت، موجودی و Shipping Class از داده ذخیره‌شده
            مرورگر پذیرفته نمی‌شوند.
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
              پیش‌نمایش Checkout
            </p>

            <h2 className="mt-2 text-2xl font-black text-ink">
              اطلاعات آماده بررسی نهایی است
            </h2>

            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-bold text-muted">
                  خریدار
                </p>

                <p className="mt-1 text-sm font-black text-ink">
                  {name.trim()}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-muted">
                  تماس
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
                  شهر
                </p>

                <p className="mt-1 text-sm font-black text-ink">
                  {city.trim()}
                </p>
              </div>

              <div>
                <p className="text-xs font-bold text-muted">
                  روش ارسال
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
                    آدرس تحویل
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
                    توضیحات
                  </p>

                  <p className="mt-1 whitespace-pre-wrap text-sm leading-7 text-ink">
                    {notes.trim()}
                  </p>
                </div>
              )
            }

            <div className="mt-6 rounded-control border border-warning-200 bg-warning-50 p-4">
              <p className="text-sm font-black text-warning-800">
                هنوز سفارش یا پرداختی ثبت نشده است
              </p>

              <p className="mt-2 text-xs leading-6 text-warning-800">
                این بخش فقط پیش‌نمایش اطلاعات است. ایجاد سفارش واقعی،
                شناسه سفارش و اتصال امن به درگاه پرداخت در مرحله سروری
                بعدی انجام می‌شود.
              </p>
            </div>
          </section>
        )
      }
    </div>
  );
}
