import type { CollectionEntry } from "astro:content";

import { serviceCategories } from "../data/serviceCategories";

export type FaqEntry =
  CollectionEntry<"faqs">;

export type FaqCategory =
  FaqEntry["data"]["category"];

export const faqCategoryLabels: Record<
  FaqCategory,
  string
> = {
  general: "عمومی",
  repair: "تعمیرات CNC",
  parts: "قطعات CNC",
  alarms: "آلارم و عیب‌یابی",
  maintenance: "نگهداری و سرویس",
  buying: "انتخاب و خرید",
  shipping: "ارسال و تحویل",
  payment: "پرداخت و سفارش",
};

export function isActiveFaq(
  faq: FaqEntry,
): boolean {
  return faq.data.status === "active";
}

export function sortFaqs(
  faqs: FaqEntry[],
): FaqEntry[] {
  return [...faqs].sort((a, b) => {
    if (
      a.data.featured !==
      b.data.featured
    ) {
      return (
        Number(b.data.featured) -
        Number(a.data.featured)
      );
    }

    if (
      a.data.order !==
      b.data.order
    ) {
      return (
        a.data.order -
        b.data.order
      );
    }

    const aPublishedAt =
      a.data.publishedAt?.getTime() ?? 0;

    const bPublishedAt =
      b.data.publishedAt?.getTime() ?? 0;

    if (
      aPublishedAt !==
      bPublishedAt
    ) {
      return (
        bPublishedAt -
        aPublishedAt
      );
    }

    return a.data.question.localeCompare(
      b.data.question,
      "fa",
    );
  });
}

export function getActiveFaqs(
  faqs: FaqEntry[],
): FaqEntry[] {
  return sortFaqs(
    faqs.filter(isActiveFaq),
  );
}

export function getFeaturedFaqs(
  faqs: FaqEntry[],
): FaqEntry[] {
  return getActiveFaqs(
    faqs,
  ).filter(
    (faq) =>
      faq.data.featured,
  );
}

export function getFaqsByCategory(
  faqs: FaqEntry[],
  category: FaqCategory,
): FaqEntry[] {
  return getActiveFaqs(
    faqs,
  ).filter(
    (faq) =>
      faq.data.category === category,
  );
}

export function getFaqHref(
  faq: FaqEntry,
): string {
  return `/faq/#faq-${faq.id}`;
}

export function getFaqCategoryLabel(
  faq: FaqEntry,
): string {
  return faqCategoryLabels[
    faq.data.category
  ];
}

export function formatFaqDate(
  date?: Date,
): string | null {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "fa-IR",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(date);
}

export function getFaqServiceTitles(
  faq: FaqEntry,
): string[] {
  return faq.data.relatedServices
    .map((serviceId) =>
      serviceCategories.find(
        (service) =>
          service.id === serviceId,
      ),
    )
    .filter(
      (
        service,
      ): service is (typeof serviceCategories)[number] =>
        Boolean(service),
    )
    .map(
      (service) =>
        service.title,
    );
}
