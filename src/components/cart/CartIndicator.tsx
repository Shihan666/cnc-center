import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  commerceConfig,
} from "../../config/commerce";

import {
  CART_UPDATED_EVENT,
  getCartStoredQuantityTotal,
} from "../../lib/cart";

export default function CartIndicator() {
  const [quantity, setQuantity] =
    useState(0);

  const [ready, setReady] =
    useState(false);

  const readQuantity =
    useCallback(() => {
      try {
        const raw =
          window.localStorage.getItem(
            commerceConfig.cart
              .storageKey,
          );

        setQuantity(
          getCartStoredQuantityTotal(
            raw,
          ),
        );
      } catch {
        setQuantity(0);
      }
    }, []);

  useEffect(() => {
    const storageKey =
      commerceConfig.cart
        .storageKey;

    const handleStorage =
      (event: StorageEvent) => {
        if (
          event.key !==
          storageKey
        ) {
          return;
        }

        readQuantity();
      };

    const handleCartUpdated =
      () => {
        readQuantity();
      };

    readQuantity();
    setReady(true);

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
  }, [readQuantity]);

  const label =
    ready && quantity > 0
      ? `سبد خرید، ${new Intl.NumberFormat(
          "fa-IR",
        ).format(quantity)} کالا`
      : "سبد خرید";

  return (
    <a
      href="/cart/"
      aria-label={label}
      title="سبد خرید"
      className="relative grid size-10 shrink-0 place-items-center rounded-control border border-line-strong bg-white text-ink transition duration-200 ease-standard hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 4h2l1.5 9h10.8l1.7-6H6" />
        <path d="M9 19.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
        <path d="M18 19.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>

      {
        ready &&
        quantity > 0 && (
          <span
            aria-hidden="true"
            className="absolute -left-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-black leading-5 text-white shadow-sm"
          >
            {new Intl.NumberFormat(
              "fa-IR",
            ).format(quantity)}
          </span>
        )
      }
    </a>
  );
}
