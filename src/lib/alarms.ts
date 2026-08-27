import type { CollectionEntry } from "astro:content";

import { serviceCategories } from "../data/serviceCategories";

export type AlarmEntry = CollectionEntry<"alarms">;

export type AlarmCategory =
  AlarmEntry["data"]["category"];

export const alarmCategoryLabels: Record<
  AlarmCategory,
  string
> = {
  controller: "کنترلر CNC",
  servo: "سروو و محور",
  spindle: "اسپیندل",
  power: "تغذیه و برق",
  communication: "ارتباطات",
  feedback: "فیدبک و انکودر",
  io: "ورودی / خروجی",
  safety: "ایمنی",
  system: "سیستم",
  other: "سایر",
};

export function isActiveAlarm(
  alarm: AlarmEntry,
): boolean {
  return alarm.data.status === "active";
}

export function sortAlarms(
  alarms: AlarmEntry[],
): AlarmEntry[] {
  return [...alarms].sort((a, b) => {
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

export function getActiveAlarms(
  alarms: AlarmEntry[],
): AlarmEntry[] {
  return sortAlarms(
    alarms.filter(isActiveAlarm),
  );
}

export function getFeaturedAlarms(
  alarms: AlarmEntry[],
): AlarmEntry[] {
  return getActiveAlarms(alarms).filter(
    (alarm) => alarm.data.featured,
  );
}

export function getAlarmHref(
  alarm: AlarmEntry,
): string {
  return `/alarms/${alarm.id}/`;
}

export function getAlarmCategoryLabel(
  alarm: AlarmEntry,
): string {
  return alarmCategoryLabels[
    alarm.data.category
  ];
}

export function formatAlarmDate(
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

export function getAlarmServiceTitles(
  alarm: AlarmEntry,
): string[] {
  return alarm.data.relatedServices
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