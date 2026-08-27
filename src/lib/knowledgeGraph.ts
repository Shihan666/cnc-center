import { serviceCategories } from "../data/serviceCategories";

import {
  getActiveAlarms,
  type AlarmEntry,
} from "./alarms";

import {
  getActiveArticles,
  type ArticleEntry,
} from "./articles";

import {
  getActiveBrands,
  type BrandEntry,
} from "./brands";

import {
  getActiveFaqs,
  type FaqEntry,
} from "./faqs";

import {
  getActiveProducts,
  type ProductEntry,
} from "./products";

import {
  getActiveRepairs,
  type RepairEntry,
} from "./repairs";

export const KNOWLEDGE_RELATED_LIMIT = 3;

export type KnowledgeEntityType =
  | "product"
  | "service"
  | "brand"
  | "alarm"
  | "repair";

export type KnowledgeService =
  (typeof serviceCategories)[number];

export interface KnowledgeGraphSources {
  products: ProductEntry[];
  brands: BrandEntry[];
  alarms: AlarmEntry[];
  repairs: RepairEntry[];
}

export interface ResolvedKnowledgeRelations {
  products: ProductEntry[];
  services: KnowledgeService[];
  brands: BrandEntry[];
  alarms: AlarmEntry[];
  repairs: RepairEntry[];
}

type KnowledgeRelationData = {
  relatedProducts: string[];
  relatedServices: string[];
  relatedBrands: string[];
  relatedAlarms: string[];
  relatedRepairs: string[];
};

function resolveEntriesByIds<
  T extends { id: string },
>(
  ids: string[],
  entries: T[],
): T[] {
  const entryMap = new Map(
    entries.map((entry) => [
      entry.id,
      entry,
    ]),
  );

  return ids
    .map((id) => entryMap.get(id))
    .filter(
      (entry): entry is T =>
        entry !== undefined,
    );
}

function resolveServicesByIds(
  ids: string[],
): KnowledgeService[] {
  const serviceMap = new Map(
    serviceCategories.map((service) => [
      service.id,
      service,
    ]),
  );

  return ids
    .map((id) => serviceMap.get(id))
    .filter(
      (
        service,
      ): service is KnowledgeService =>
        service !== undefined,
    );
}

function clampKnowledgeLimit(
  limit: number,
): number {
  if (!Number.isFinite(limit)) {
    return KNOWLEDGE_RELATED_LIMIT;
  }

  return Math.max(
    0,
    Math.min(
      KNOWLEDGE_RELATED_LIMIT,
      Math.floor(limit),
    ),
  );
}

function hasKnowledgeRelation(
  data: KnowledgeRelationData,
  entityType: KnowledgeEntityType,
  entityId: string,
): boolean {
  switch (entityType) {
    case "product":
      return data.relatedProducts.includes(
        entityId,
      );

    case "service":
      return data.relatedServices.includes(
        entityId,
      );

    case "brand":
      return data.relatedBrands.includes(
        entityId,
      );

    case "alarm":
      return data.relatedAlarms.includes(
        entityId,
      );

    case "repair":
      return data.relatedRepairs.includes(
        entityId,
      );
  }
}

function resolveRelations(
  data: KnowledgeRelationData,
  sources: KnowledgeGraphSources,
): ResolvedKnowledgeRelations {
  const activeProducts =
    getActiveProducts(sources.products);

  const activeBrands =
    getActiveBrands(sources.brands);

  const activeAlarms =
    getActiveAlarms(sources.alarms);

  const activeRepairs =
    getActiveRepairs(sources.repairs);

  return {
    products: resolveEntriesByIds(
      data.relatedProducts,
      activeProducts,
    ),

    services: resolveServicesByIds(
      data.relatedServices,
    ),

    brands: resolveEntriesByIds(
      data.relatedBrands,
      activeBrands,
    ),

    alarms: resolveEntriesByIds(
      data.relatedAlarms,
      activeAlarms,
    ),

    repairs: resolveEntriesByIds(
      data.relatedRepairs,
      activeRepairs,
    ),
  };
}

export function resolveArticleRelations(
  article: ArticleEntry,
  sources: KnowledgeGraphSources,
): ResolvedKnowledgeRelations {
  return resolveRelations(
    article.data,
    sources,
  );
}

export function resolveFaqRelations(
  faq: FaqEntry,
  sources: KnowledgeGraphSources,
): ResolvedKnowledgeRelations {
  return resolveRelations(
    faq.data,
    sources,
  );
}

export function getRelatedActiveArticlesForEntity(
  articles: ArticleEntry[],
  entityType: KnowledgeEntityType,
  entityId: string,
  limit = KNOWLEDGE_RELATED_LIMIT,
): ArticleEntry[] {
  const safeLimit =
    clampKnowledgeLimit(limit);

  if (
    safeLimit === 0 ||
    entityId.trim().length === 0
  ) {
    return [];
  }

  return getActiveArticles(articles)
    .filter((article) =>
      hasKnowledgeRelation(
        article.data,
        entityType,
        entityId,
      ),
    )
    .slice(0, safeLimit);
}

export function getRelatedActiveFaqsForEntity(
  faqs: FaqEntry[],
  entityType: KnowledgeEntityType,
  entityId: string,
  limit = KNOWLEDGE_RELATED_LIMIT,
): FaqEntry[] {
  const safeLimit =
    clampKnowledgeLimit(limit);

  if (
    safeLimit === 0 ||
    entityId.trim().length === 0
  ) {
    return [];
  }

  return getActiveFaqs(faqs)
    .filter((faq) =>
      hasKnowledgeRelation(
        faq.data,
        entityType,
        entityId,
      ),
    )
    .slice(0, safeLimit);
}