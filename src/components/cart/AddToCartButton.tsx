import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  commerceConfig,
} from "../../config/commerce";

import {
  dispatchCartUpdatedEvent,
  parseCartStorage,
  serializeCartStorage,
  type CartStorageItem,
} from "../../lib/cart";

interface Props {
  productId: string;
  stockQuantity: number;
}

function getStoredQuantity(
  items:
    readonly CartStorageItem[],
  productId: string,
): number {
  let quantity = 0;

  for (const item of items) {
    if (
      item.productId !== productId
    ) {
      continue;
    }

    quantity += item.quantity;

    if (
      quantity >=
      commerceConfig.cart
        .maxQuantityPerLine
    ) {
      return commerceConfig.cart
        .maxQuantityPerLine;
    }
  }

  return quantity;
}

function normalizeOtherItems(
  items:
    readonly CartStorageItem[],
  productId: string,
): CartStorageItem[] {
  const quantities =
    new Map<string, number>();

  for (const item of items) {
    if (
      item.productId === productId
    ) {
      continue;
    }

    const current =
      quantities.get(
        item.productId,
      ) ?? 0;

    quantities.set(
      item.productId,
      Math.min(
        current + item.quantity,
        commerceConfig.cart
          .maxQuantityPerLine,
      ),
    );
  }

  return Array.from(
    quantities,
    ([storedProductId, quantity]) => ({
      productId:
        storedProductId,

      quantity,
    }),
  ).slice(
    0,
    commerceConfig.cart
      .maxDistinctItems,
  );
}

export default function AddToCartButton({
  productId,
  stockQuantity,
}: Props) {
  const [ready, setReady] =
    useState(false);

  const [quantityInCart, setQuantityInCart] =
    useState(0);

  const [message, setMessage] =
    useState("");

  const maximumQuantity =
    Math.min(
      stockQuantity,
      commerceConfig.cart
        .maxQuantityPerLine,
    );

  const readQuantity =
    useCallback(() => {
      try {
        const items =
          parseCartStorage(
            window.localStorage
              .getItem(
                commerceConfig.cart
                  .storageKey,
              ),
          );

        const quantity =
          Math.min(
            getStoredQuantity(
              items,
              productId,
            ),
            maximumQuantity,
          );

        setQuantityInCart(
          quantity,
        );
      } catch {
        setQuantityInCart(0);
      }
    }, [
      productId,
      maximumQuantity,
    ]);

  useEffect(() => {
    readQuantity();
    setReady(true);

    const handleStorage =
      (
        event:
          StorageEvent,
      ) => {
        if (
          event.key !==
          commerceConfig.cart
            .storageKey
        ) {
          return;
        }

        readQuantity();
      };

    window.addEventListener(
      "storage",
      handleStorage,
    );

    return () => {
      window.removeEventListener(
        "storage",
        handleStorage,
      );
    };
  }, [readQuantity]);

  function addToCart() {
    if (
      !Number.isSafeInteger(
        stockQuantity,
      ) ||
      stockQuantity < 1 ||
      maximumQuantity < 1
    ) {
      setMessage(
        "این کالا در حال حاضر موجودی قابل خرید ندارد.",
      );

      return;
    }

    try {
      const storageKey =
        commerceConfig.cart
          .storageKey;

      const storedItems =
        parseCartStorage(
          window.localStorage
            .getItem(storageKey),
        );

      const currentQuantity =
        Math.min(
          getStoredQuantity(
            storedItems,
            productId,
          ),
          maximumQuantity,
        );

      if (
        currentQuantity >=
        maximumQuantity
      ) {
        setQuantityInCart(
          maximumQuantity,
        );

        setMessage(
          "حداکثر موجودی قابل خرید این کالا در سبد شما قرار دارد.",
        );

        return;
      }

      const otherItems =
        normalizeOtherItems(
          storedItems,
          productId,
        );

      const productAlreadyExists =
        currentQuantity > 0;

      if (
        !productAlreadyExists &&
        otherItems.length >=
          commerceConfig.cart
            .maxDistinctItems
      ) {
        setMessage(
          "ظرفیت تعداد اقلام سبد خرید تکمیل شده است.",
        );

        return;
      }

      const nextQuantity =
        Math.min(
          currentQuantity + 1,
          maximumQuantity,
        );

      const nextItems: CartStorageItem[] = [
        ...otherItems,
        {
          productId,
          quantity:
            nextQuantity,
        },
      ];

      window.localStorage
        .setItem(
          storageKey,
          serializeCartStorage(
            nextItems,
          ),
        );

      dispatchCartUpdatedEvent();

      setQuantityInCart(
        nextQuantity,
      );

      setMessage(
        nextQuantity ===
          maximumQuantity
          ? "کالا افزوده شد و سقف موجودی قابل خرید این محصول در سبد قرار گرفت."
          : "کالا به سبد خرید افزوده شد.",
      );
    } catch {
      setMessage(
        "ذخیره سبد خرید در مرورگر انجام نشد. دوباره تلاش کنید.",
      );
    }
  }

  const reachedMaximum =
    ready &&
    maximumQuantity > 0 &&
    quantityInCart >=
      maximumQuantity;

  return (
    <div>
      <button
        type="button"
        onClick={addToCart}
        disabled={
          !ready ||
          maximumQuantity < 1 ||
          reachedMaximum
        }
        className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand-600 px-6 py-3.5 text-base font-semibold leading-none text-white shadow-sm transition duration-200 ease-standard hover:bg-brand-700 active:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {
          !ready
            ? "آماده‌سازی سبد خرید..."
            : reachedMaximum
              ? "حداکثر موجودی در سبد"
              : "افزودن به سبد خرید"
        }
      </button>

      {
        ready &&
        quantityInCart > 0 && (
          <p className="mt-3 text-center text-xs font-bold text-muted">
            موجود در سبد:
            {" "}
            {new Intl.NumberFormat(
              "fa-IR",
            ).format(
              quantityInCart,
            )}
            {" "}
            از
            {" "}
            {new Intl.NumberFormat(
              "fa-IR",
            ).format(
              maximumQuantity,
            )}
            {" "}
            عدد
          </p>
        )
      }

      {
        message && (
          <div
            className="mt-3 rounded-control border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-7 text-brand-800"
            role="status"
            aria-live="polite"
          >
            <p className="font-bold">
              {message}
            </p>
          </div>
        )
      }

      {
        ready &&
        quantityInCart > 0 && (
          <a
            href="/cart/"
            className="mt-3 inline-flex w-full min-h-11 items-center justify-center rounded-control border border-line-strong bg-white px-4 py-2.5 text-sm font-black text-brand-700 transition hover:bg-surface-soft hover:text-brand-800"
          >
            مشاهده سبد خرید
          </a>
        )
      }
    </div>
  );
}
