import type { CollectionEntry } from "astro:content";

import { serviceCategories } from "../data/serviceCategories";

export type RepairEntry = CollectionEntry<"repairs">;

export function isActiveRepair(repair: RepairEntry): boolean {
  return repair.data.status === "active";
}

export function sortRepairs(
  repairs: RepairEntry[],
): RepairEntry[] {
  return [...repairs].sort((a, b) => {
    if (a.data.featured !== b.data.featured) {
      return Number(b.data.featured) - Number(a.data.featured);
    }

    if (a.data.order !== b.data.order) {
      return a.data.order - b.data.order;
    }

    const aPublishedAt =
      a.data.publishedAt?.getTime() ?? 0;

    const bPublishedAt =
      b.data.publishedAt?.getTime() ?? 0;

    if (aPublishedAt !== bPublishedAt) {
      return bPublishedAt - aPublishedAt;
    }

    return a.data.title.localeCompare(
      b.data.title,
      "fa",
    );
  });
}

export function getActiveRepairs(
  repairs: RepairEntry[],
): RepairEntry[] {
  return sortRepairs(
    repairs.filter(isActiveRepair),
  );
}

export function getFeaturedRepairs(
  repairs: RepairEntry[],
): RepairEntry[] {
  return getActiveRepairs(repairs).filter(
    (repair) => repair.data.featured,
  );
}

export function getRepairHref(
  repair: RepairEntry,
): string {
  return `/repairs/${repair.id}/`;
}

export function formatRepairDate(
  date?: Date,
): string | null {
  if (!date) {
    return null;
  }

  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function getRepairServiceTitles(
  repair: RepairEntry,
): string[] {
  return repair.data.relatedServices
    .map((serviceId) =>
      serviceCategories.find(
        (service) => service.id === serviceId,
      ),
    )
    .filter(
      (
        service,
      ): service is (typeof serviceCategories)[number] =>
        Boolean(service),
    )
    .map((service) => service.title);
}