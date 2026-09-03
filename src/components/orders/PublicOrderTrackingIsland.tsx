import {
  type SyntheticEvent,
  useState,
} from "react";

interface TrackedOrderSummary {
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
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

function getStatusLabel(
  status: string,
): string {
  const labels:
    Record<string, string> = {
      pending:
        "در انتظار ادامه فرایند سفارش",

      awaiting_payment:
        "در انتظار پرداخت",

      paid:
        "پرداخت شده",

      processing:
        "در حال پردازش",

      ready_to_ship:
        "آماده ارسال",

      shipped:
        "ارسال شده",

      completed:
        "تکمیل شده",

      cancelled:
        "لغو شده",

      expired:
        "منقضی شده",
    };

  return (
    labels[status] ??
    "وضعیت سفارش در حال بررسی است"
  );
}

function getStatusDescription(
  status: string,
): string {
  const descriptions:
    Record<string, string> = {
      pending:
        "سفارش ثبت شده است و فرایند بعدی آن هنوز تکمیل نشده است.",

      awaiting_payment:
        "سفارش برای مرحله پرداخت آماده شده و در انتظار تکمیل پرداخت است.",

      paid:
        "پرداخت سفارش ثبت شده است.",

      processing:
        "سفارش در حال آماده‌سازی و پردازش است.",

      ready_to_ship:
        "سفارش آماده تحویل به بخش ارسال است.",

      shipped:
        "سفارش ارسال شده است.",

      completed:
        "فرایند سفارش تکمیل شده است.",

      cancelled:
        "این سفارش لغو شده است.",

      expired:
        "مهلت رزرو این سفارش به پایان رسیده است.",
    };

  return (
    descriptions[status] ??
    "برای اطلاعات بیشتر با پشتیبانی تماس بگیرید."
  );
}

function formatOrderDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "fa-IR",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(date);
}

export default function PublicOrderTrackingIsland() {
  const [
    orderNumber,
    setOrderNumber,
  ] =
    useState("");

  const [
    phone,
    setPhone,
  ] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    order,
    setOrder,
  ] =
    useState<TrackedOrderSummary | null>(
      null,
    );

  async function handleSubmit(
    event:
      SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    const normalizedOrderNumber =
      orderNumber
        .trim()
        .toUpperCase();

    const normalizedPhone =
      normalizeIranPhone(
        phone,
      );

    if (
      !normalizedOrderNumber ||
      !normalizedPhone
    ) {
      setOrder(null);

      setError(
        "شماره سفارش و شماره تماس ثبت‌شده در سفارش را وارد کنید.",
      );

      return;
    }

    setSubmitting(true);
    setError("");
    setOrder(null);

    try {
      const response =
        await fetch(
          "/api/orders/track",
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
                orderNumber:
                  normalizedOrderNumber,

                phone:
                  normalizedPhone,
              }),
          },
        );

      let body:
        unknown = null;

      try {
        body =
          await response.json();
      } catch {
        body = null;
      }

      if (
        response.ok &&
        isRecord(body) &&
        body.ok === true &&
        isRecord(body.order) &&
        typeof body.order
          .orderNumber ===
          "string" &&
        typeof body.order.status ===
          "string" &&
        typeof body.order.createdAt ===
          "string" &&
        typeof body.order.updatedAt ===
          "string" &&
        (
          body.order.paidAt ===
            null ||
          typeof body.order.paidAt ===
            "string"
        )
      ) {
        setOrder({
          orderNumber:
            body.order.orderNumber,

          status:
            body.order.status,

          createdAt:
            body.order.createdAt,

          updatedAt:
            body.order.updatedAt,

          paidAt:
            body.order.paidAt,
        });

        return;
      }

      if (
        response.status === 404
      ) {
        setError(
          "سفارشی با این شماره سفارش و شماره تماس پیدا نشد. اطلاعات را دوباره بررسی کنید.",
        );

        return;
      }

      if (
        response.status === 400
      ) {
        setError(
          "شماره سفارش یا شماره تماس واردشده معتبر نیست.",
        );

        return;
      }

      setError(
        "دریافت وضعیت سفارش انجام نشد. لطفاً دوباره تلاش کنید.",
      );
    } catch {
      setError(
        "ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-panel border border-line bg-surface-raised p-5 shadow-card sm:p-7 md:p-8"
      >
        <div>
          <p className="text-sm font-bold text-brand-700">
            اطلاعات پیگیری
          </p>

          <h2 className="mt-2 text-xl font-black text-ink">
            سفارش خود را پیدا کنید
          </h2>

          <p className="mt-3 text-sm leading-7 text-muted">
            برای حفظ حریم خصوصی، شماره سفارش به‌تنهایی کافی نیست و شماره تماس ثبت‌شده هنگام سفارش نیز لازم است.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-ink">
              شماره سفارش
            </span>

            <input
              type="text"
              value={orderNumber}
              onChange={(event) =>
                setOrderNumber(
                  event.target.value,
                )
              }
              autoComplete="off"
              inputMode="text"
              dir="ltr"
              placeholder="CNC-..."
              className="min-h-12 w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-left text-sm font-semibold text-ink outline-none transition focus:border-brand-600"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-ink">
              شماره تماس سفارش
            </span>

            <input
              type="tel"
              value={phone}
              onChange={(event) =>
                setPhone(
                  event.target.value,
                )
              }
              autoComplete="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="09121234567"
              className="min-h-12 w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-left text-sm font-semibold text-ink outline-none transition focus:border-brand-600"
            />
          </label>
        </div>

        {
          error && (
            <div
              className="mt-5 rounded-control border border-red-200 bg-red-50 px-4 py-3"
              role="alert"
            >
              <p className="text-sm font-bold leading-7 text-red-800">
                {error}
              </p>
            </div>
          )
        }

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-control bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {
            submitting
              ? "در حال بررسی..."
              : "پیگیری سفارش"
          }
        </button>
      </form>

      <section
        className="rounded-panel border border-line bg-surface-raised p-5 shadow-card sm:p-7 md:p-8"
        aria-live="polite"
      >
        {
          order ? (
            <>
              <p className="text-sm font-bold text-brand-700">
                وضعیت فعلی سفارش
              </p>

              <h2 className="mt-2 text-2xl font-black text-ink">
                {getStatusLabel(
                  order.status,
                )}
              </h2>

              <p className="mt-3 text-sm leading-8 text-muted">
                {getStatusDescription(
                  order.status,
                )}
              </p>

              <dl className="mt-7 grid gap-4 sm:grid-cols-2">
                <div className="rounded-control bg-surface-soft p-4">
                  <dt className="text-xs font-bold text-muted">
                    شماره سفارش
                  </dt>

                  <dd
                    dir="ltr"
                    className="mt-2 text-left text-sm font-black text-ink"
                  >
                    {order.orderNumber}
                  </dd>
                </div>

                <div className="rounded-control bg-surface-soft p-4">
                  <dt className="text-xs font-bold text-muted">
                    وضعیت
                  </dt>

                  <dd className="mt-2 text-sm font-black text-ink">
                    {getStatusLabel(
                      order.status,
                    )}
                  </dd>
                </div>

                <div className="rounded-control bg-surface-soft p-4">
                  <dt className="text-xs font-bold text-muted">
                    زمان ثبت سفارش
                  </dt>

                  <dd className="mt-2 text-sm font-black text-ink">
                    {formatOrderDate(
                      order.createdAt,
                    )}
                  </dd>
                </div>

                <div className="rounded-control bg-surface-soft p-4">
                  <dt className="text-xs font-bold text-muted">
                    آخرین بروزرسانی
                  </dt>

                  <dd className="mt-2 text-sm font-black text-ink">
                    {formatOrderDate(
                      order.updatedAt,
                    )}
                  </dd>
                </div>
              </dl>

              {
                order.paidAt && (
                  <div className="mt-4 rounded-control border border-green-200 bg-green-50 px-4 py-3">
                    <p className="text-sm font-bold text-signal">
                      زمان ثبت پرداخت:
                      {" "}
                      {formatOrderDate(
                        order.paidAt,
                      )}
                    </p>
                  </div>
                )
              }
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-soft text-xl font-black text-brand-700"
                aria-hidden="true"
              >
                ؟
              </div>

              <h2 className="mt-5 text-xl font-black text-ink">
                وضعیت سفارش اینجا نمایش داده می‌شود
              </h2>

              <p className="mt-3 max-w-lg text-sm leading-8 text-muted">
                شماره سفارش و شماره تماس ثبت‌شده را وارد کنید. این صفحه فقط وضعیت سفارش را نمایش می‌دهد و هیچ عملیات پرداختی انجام نمی‌دهد.
              </p>
            </div>
          )
        }
      </section>
    </div>
  );
}