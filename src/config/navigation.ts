export interface NavigationItem {
  label: string;
  href: string;
}

export const primaryNavigation: NavigationItem[] = [
  {
    label: "صفحه اصلی",
    href: "/",
  },
  {
    label: "تعمیرات CNC",
    href: "/services/",
  },
  {
    label: "فروشگاه قطعات",
    href: "/shop/",
  },
  {
    label: "برندها",
    href: "/brands/",
  },
  {
    label: "سوابق تعمیر",
    href: "/repairs/",
  },
  {
    label: "مرکز آلارم",
    href: "/alarms/",
  },
  {
    label: "دانشنامه",
    href: "/blog/",
  },
];

export const requestNavigation: NavigationItem[] = [
  {
    label: "درخواست تعمیر",
    href: "/request/repair/",
  },
  {
    label: "درخواست قطعه",
    href: "/request/part/",
  },
];