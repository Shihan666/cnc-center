import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  cartLinesToStorageItems,
  CART_UPDATED_EVENT,
  calculateResolvedCartSubtotalRial,
  dispatchCartUpdatedEvent,
  formatRialAmount,
  formatTomanFromRial,
  parseCartStorage,
  resolveCartLines,
  serializeCartStorage,
  type CartCatalogItem,
  type CartStorageItem,
  type ResolvedCartLine,
} from "../../lib/cart";

import {
  commerceConfig,
} from "../../config/commerce";

interface Props {
  catalog:
    readonly CartCatalogItem[];
}

function normalizedStorageFromLines(
  lines:
    readonly ResolvedCartLine[],
): string {
  return serializeCartStorage(
    cartLinesToStorageItems(lines),
  );
}

export default function CartIsland({
  catalog,
}: Props) {
  const [lines, setLines] =
    useState<ResolvedCartLine[]>([]);

  const [hydrated, setHydrated] =
    useState(false);

  const [notice, setNotice] =
    useState("");

  const commitItems =
    useCallback(
      (
        items:
          readonly CartStorageItem[],

        message = "",
      ) => {
        const resolved =
          resolveCartLines(
            items,
            catalog,
          );

        const normalized =
          cartLinesToStorageItems(
            resolved,
          );

        if (
          normalized.length === 0
        ) {
          window.localStorage
            .removeItem(
              commerceConfig.cart
                .storageKey,
            );
        }

        if (
          normalized.length > 0
        ) {
          window.localStorage
            .setItem(
              commerceConfig.cart
                .storageKey,

              serializeCartStorage(
                normalized,
              ),
            );
        }

        dispatchCartUpdatedEvent();

        setLines(resolved);
        setNotice(message);
      },
      [catalog],
    );

  useEffect(() => {
    const storageKey =
      commerceConfig.cart
        .storageKey;

    const raw =
      window.localStorage
        .getItem(storageKey);

    const parsed =
      parseCartStorage(raw);

    const resolved =
      resolveCartLines(
        parsed,
        catalog,
      );

    const normalized =
      normalizedStorageFromLines(
        resolved,
      );

    const parsedNormalized =
      serializeCartStorage(
        parsed,
      );

    if (
      resolved.length === 0
    ) {
      window.localStorage
        .removeItem(storageKey);
    }

    if (
      resolved.length > 0 &&
      raw !== normalized
    ) {
      window.localStorage
        .setItem(
          storageKey,
          normalized,
        );
    }

    if (
      raw !==
      normalized
    ) {
      dispatchCartUpdatedEvent();
    }

    if (
      parsedNormalized !==
      normalized
    ) {
      setNotice(
        "سبد خرید با موجودی و اطلاعات فعلی کاتالوگ هماهنگ شد.",
      );
    }

    setLines(resolved);
    setHydrated(true);

    const handleStorage =
      (
        event:
          StorageEvent,
      ) => {
        if (
          event.key !==
          storageKey
        ) {
          return;
        }

        const next =
          parseCartStorage(
            event.newValue,
          );

        setLines(
          resolveCartLines(
            next,
            catalog,
          ),
        );
      };

    const handleCartUpdated =
      () => {
        const next =
          parseCartStorage(
            window.localStorage.getItem(
              storageKey,
            ),
          );

        setLines(
          resolveCartLines(
            next,
            catalog,
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
  }, [catalog]);

  const subtotalRial =
    useMemo(
      () =>
        calculateResolvedCartSubtotalRial(
          lines,
        ),
      [lines],
    );

  function updateQuantity(
    productId: string,
    nextQuantity: number,
  ) {
    const items =
      cartLinesToStorageItems(
        lines,
      ).map((item) =>
        item.productId ===
        productId
          ? {
              ...item,

              quantity:
                nextQuantity,
            }
          : item,
      );

    commitItems(
      items,
      "تعداد کالا به‌روزرسانی شد.",
    );
  }

  function removeProduct(
    productId: string,
  ) {
    const items =
      cartLinesToStorageItems(
        lines,
      ).filter(
        (item) =>
          item.productId !==
          productId,
      );

    commitItems(
      items,
      "کالا از سبد خرید حذف شد.",
    );
  }

  function clearCart() {
    commitItems(
      [],
      "سبد خرید پاک شد.",
    );
  }

  if (!hydrated) {
    return (
      <div
        className="rounded-card border border-line bg-surface-raised p-6 shadow-card"
        aria-live="polite"
      >
        <p className="text-sm font-bold text-muted">
          در حال بررسی سبد خرید ذخیره‌شده...
        </p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div
        className="rounded-card border border-line bg-surface-raised p-6 text-center shadow-card md:p-8"
        data-cart-empty
      >
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-xl font-black text-brand-700"
          aria-hidden="true"
        >
          ۰
        </div>

        <h2 className="mt-5 text-xl font-black text-ink">
          سبد خرید شما خالی است
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-sm leading-8 text-muted">
          فقط محصولاتی که خرید مستقیم، قیمت معتبر و موجودی فعال دارند
          می‌توانند وارد سبد خرید شوند.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href="/products/buy/"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            مشاهده محصولات آماده خرید
          </a>

          <a
            href="/request/part/"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface-raised px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface-soft"
          >
            درخواست قطعه
          </a>
        </div>

        {
          notice && (
            <p
              className="mt-5 text-sm font-bold text-brand-700"
              role="status"
            >
              {notice}
            </p>
          )
        }
      </div>
    );
  }

  return (
    <div
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      data-cart-ready
    >
      <section
        className="space-y-4"
        aria-labelledby="cart-items-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-brand-700">
              اقلام سبد
            </p>

            <h2
              id="cart-items-title"
              className="mt-1 text-2xl font-black text-ink"
            >
              {new Intl.NumberFormat("fa-IR").format(lines.length)}
              {" "}
              قلم کالا
            </h2>
          </div>

          <button
            type="button"
            onClick={clearCart}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface-raised px-4 py-2 text-sm font-bold text-ink transition hover:bg-surface-soft"
          >
            پاک‌کردن سبد
          </button>
        </div>

        {
          notice && (
            <p
              className="rounded-control border border-brand-100 bg-brand-50 px-4 py-3 text-sm font-bold text-brand-800"
              role="status"
            >
              {notice}
            </p>
          )
        }

        <div className="space-y-4">
          {lines.map((line) => (
            <article
              key={line.id}
              className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-card"
            >
              <div className="grid gap-5 p-5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-control border border-line bg-surface-soft p-3">
                  {
                    line.image ? (
                      <img
                        src={line.image}
                        alt={line.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span
                        dir="ltr"
                        className="text-lg font-black text-line-strong"
                      >
                        CNC
                      </span>
                    )
                  }
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-black leading-8 text-ink">
                        <a
                          href={line.href}
                          className="transition hover:text-brand-700"
                        >
                          {line.name}
                        </a>
                      </h3>

                      <p
                        dir="ltr"
                        className="mt-1 text-xs font-bold text-muted"
                      >
                        {line.brand} · P/N: {line.partNumber}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        removeProduct(
                          line.id,
                        )
                      }
                      className="inline-flex min-h-10 items-center justify-center rounded-control border border-line px-3 text-xs font-bold text-muted transition hover:border-danger-200 hover:text-danger-700"
                      aria-label={`حذف ${line.name} از سبد خرید`}
                    >
                      حذف
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-bold text-muted">
                        قیمت واحد
                      </p>

                      <p className="mt-1 text-base font-black text-ink">
                        {line.displayPrice}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-muted">
                        موجودی قابل خرید
                      </p>

                      <p className="mt-1 text-base font-black text-ink">
                        {new Intl.NumberFormat("fa-IR").format(line.stockQuantity)}
                        {" "}
                        عدد
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <label
                        htmlFor={`cart-quantity-${line.id}`}
                        className="block text-xs font-bold text-muted"
                      >
                        تعداد
                      </label>

                      <input
                        id={`cart-quantity-${line.id}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={Math.min(
                          line.stockQuantity,
                          commerceConfig.cart.maxQuantityPerLine,
                        )}
                        value={line.quantity}
                        onChange={(event) => {
                          const value =
                            Number(
                              event.currentTarget.value,
                            );

                          if (
                            !Number.isSafeInteger(value) ||
                            value < 1
                          ) {
                            return;
                          }

                          updateQuantity(
                            line.id,
                            value,
                          );
                        }}
                        className="mt-2 min-h-11 w-28 rounded-control border border-line-strong bg-surface-raised px-3 text-center text-sm font-black text-ink outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />

                      {
                        line.quantity >=
                          Math.min(
                            line.stockQuantity,
                            commerceConfig.cart
                              .maxQuantityPerLine,
                          ) && (
                            <p
                              className="mt-2 max-w-44 text-xs font-bold leading-6 text-warning-800"
                              role="status"
                            >
                              به سقف موجودی قابل خرید رسیده‌اید.
                            </p>
                          )
                      }
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-xs font-bold text-muted">
                        جمع این کالا
                      </p>

                      <p className="mt-1 text-base font-black text-brand-700">
                        {formatTomanFromRial(line.lineTotalRial)}
                      </p>

                      <p
                        dir="ltr"
                        className="mt-1 text-xs font-bold text-muted"
                      >
                        {formatRialAmount(line.lineTotalRial)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="h-fit rounded-card border border-line bg-surface-raised p-6 shadow-card lg:sticky lg:top-24">
        <p className="text-sm font-bold text-brand-700">
          خلاصه سبد
        </p>

        <h2 className="mt-2 text-xl font-black text-ink">
          جمع کالاها
        </h2>

        <p className="mt-5 text-2xl font-black text-ink">
          {formatTomanFromRial(subtotalRial)}
        </p>

        <p
          dir="ltr"
          className="mt-1 text-xs font-bold text-muted"
        >
          {formatRialAmount(subtotalRial)}
        </p>

        <div className="mt-6 space-y-3 border-t border-line pt-5 text-sm leading-7 text-muted">
          <p>
            هزینه ارسال هنوز به این مبلغ اضافه نشده است.
          </p>

          <p>
            قیمت و موجودی در مرحله ثبت سفارش دوباره از منبع معتبر
            بررسی خواهند شد.
          </p>
        </div>

        <div className="mt-6 border-t border-line pt-6">
          <a
            href="/checkout/"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand-600 px-6 py-3.5 text-base font-semibold leading-none text-white shadow-sm transition duration-200 ease-standard hover:bg-brand-700 active:bg-brand-800"
          >
            ادامه و ثبت اطلاعات سفارش
          </a>

          <p className="mt-3 text-xs leading-6 text-muted">
            در مرحله بعد اطلاعات خریدار و روش ارسال بررسی می‌شود.
            پرداخت آنلاین هنوز فعال نیست.
          </p>
        </div>
      </aside>
    </div>
  );
}
