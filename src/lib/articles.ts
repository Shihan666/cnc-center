import type { CollectionEntry } from "astro:content";

import { serviceCategories } from "../data/serviceCategories";

export type ArticleEntry =
  CollectionEntry<"articles">;

export type ArticleCategory =
  ArticleEntry["data"]["category"];

export const articleCategoryLabels: Record<
  ArticleCategory,
  string
> = {
  fundamentals: "مبانی CNC",
  troubleshooting: "عیب‌یابی",
  maintenance: "نگهداری و سرویس",
  repair: "تعمیرات",
  parts: "قطعات CNC",
  automation: "کنترل و اتوماسیون",
  "buying-guide": "راهنمای انتخاب و خرید",
};

export function isActiveArticle(
  article: ArticleEntry,
): boolean {
  return article.data.status === "active";
}

export function sortArticles(
  articles: ArticleEntry[],
): ArticleEntry[] {
  return [...articles].sort((a, b) => {
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

    return a.data.title.localeCompare(
      b.data.title,
      "fa",
    );
  });
}

export function getActiveArticles(
  articles: ArticleEntry[],
): ArticleEntry[] {
  return sortArticles(
    articles.filter(isActiveArticle),
  );
}

export function getFeaturedArticles(
  articles: ArticleEntry[],
): ArticleEntry[] {
  return getActiveArticles(
    articles,
  ).filter(
    (article) =>
      article.data.featured,
  );
}

export function getArticlesByCategory(
  articles: ArticleEntry[],
  category: ArticleCategory,
): ArticleEntry[] {
  return getActiveArticles(
    articles,
  ).filter(
    (article) =>
      article.data.category === category,
  );
}

export function getArticleHref(
  article: ArticleEntry,
): string {
  return `/blog/${article.id}/`;
}

export function getArticleCategoryLabel(
  article: ArticleEntry,
): string {
  return articleCategoryLabels[
    article.data.category
  ];
}

export function formatArticleDate(
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

export function getArticleServiceTitles(
  article: ArticleEntry,
): string[] {
  return article.data.relatedServices
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