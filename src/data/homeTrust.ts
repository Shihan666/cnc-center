export interface TrustItem {
  number: string;
  title: string;
  description: string;
}

export interface RepairProcessStep {
  number: string;
  title: string;
  description: string;
}

export const trustItems: TrustItem[] = [
  {
    number: "01",
    title: "تمرکز تخصصی روی CNC",
    description:
      "ساختار خدمات، فروشگاه و محتوای فنی سایت بر اساس نیاز ماشین‌آلات CNC طراحی شده است.",
  },
  {
    number: "02",
    title: "بررسی فنی قبل از پیشنهاد",
    description:
      "مدل دستگاه، برند کنترل، کد آلارم و Part Number برای انتخاب مسیر مناسب بررسی می‌شوند.",
  },
  {
    number: "03",
    title: "تعمیر و تأمین قطعه در یک مسیر",
    description:
      "در صورت نیاز می‌توان هم‌زمان خرابی تجهیز و امکان تعمیر، جایگزینی یا تأمین قطعه را بررسی کرد.",
  },
  {
    number: "04",
    title: "پشتیبانی برای سراسر ایران",
    description:
      "هماهنگی دریافت تجهیزات و ارسال قطعات برای مشتریان صنعتی در شهرهای مختلف قابل انجام است.",
  },
];

export const repairProcessSteps: RepairProcessStep[] = [
  {
    number: "01",
    title: "ارسال مشخصات",
    description:
      "مدل دستگاه، برند کنترل، کد آلارم، تصویر پلاک یا شرح خرابی ارسال می‌شود.",
  },
  {
    number: "02",
    title: "بررسی اولیه",
    description:
      "اطلاعات فنی بررسی می‌شود تا بخش احتمالی خرابی و مسیر ادامه کار مشخص شود.",
  },
  {
    number: "03",
    title: "هماهنگی تعمیر یا ارسال",
    description:
      "در صورت نیاز، نحوه ارسال تجهیز، مراجعه فنی یا بررسی قطعه هماهنگ می‌شود.",
  },
  {
    number: "04",
    title: "تعمیر و تست",
    description:
      "تجهیز عیب‌یابی، تعمیر و تا حد امکان از نظر عملکرد اولیه بررسی می‌شود.",
  },
  {
    number: "05",
    title: "تحویل و پشتیبانی",
    description:
      "پس از پایان کار، نتیجه بررسی و وضعیت تجهیز برای تحویل یا ارسال هماهنگ می‌شود.",
  },
];