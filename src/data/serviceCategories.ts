export interface ServiceCategory {
  id: string;
  number: string;
  title: string;
  description: string;
  examples: string[];
}

export const serviceCategories: ServiceCategory[] = [
  {
    id: "machine",
    number: "01",
    title: "تعمیر و عیب‌یابی دستگاه CNC",
    description:
      "بررسی توقف دستگاه، خطاهای عملکردی، مشکلات راه‌اندازی و عیب‌یابی اولیه ماشین.",
    examples: [
      "توقف ماشین",
      "خطای راه‌اندازی",
      "عیب‌یابی عمومی",
    ],
  },
  {
    id: "motion",
    number: "02",
    title: "سروو، درایو و سیستم حرکت",
    description:
      "بررسی سروو موتور، سروو درایو، محورهای حرکتی و مشکلات Position یا حرکت نامنظم.",
    examples: [
      "Servo Drive",
      "Servo Motor",
      "Axis Fault",
    ],
  },
  {
    id: "spindle",
    number: "03",
    title: "اسپیندل و Spindle Drive",
    description:
      "عیب‌یابی اسپیندل موتور، درایو اسپیندل، دور نامناسب، توقف و خطاهای مرتبط.",
    examples: [
      "Spindle Motor",
      "Spindle Drive",
      "Speed Fault",
    ],
  },
  {
    id: "control",
    number: "04",
    title: "کنترلر CNC، PLC و HMI",
    description:
      "بررسی سیستم کنترل، پنل اپراتوری، PLC، ارتباطات و مشکلات مرتبط با کنترل ماشین.",
    examples: [
      "CNC Control",
      "PLC",
      "HMI",
    ],
  },
  {
    id: "electronics",
    number: "05",
    title: "برد و تجهیزات الکترونیکی",
    description:
      "تعمیر و بررسی بردهای الکترونیکی، پاور، ماژول‌ها و تجهیزات کنترلی دستگاه.",
    examples: [
      "Power Supply",
      "PCB",
      "Control Module",
    ],
  },
  {
    id: "mechanical",
    number: "06",
    title: "بخش‌های مکانیکی CNC",
    description:
      "بررسی مشکلات مکانیکی مؤثر بر دقت، حرکت و عملکرد دستگاه و اجزای انتقال نیرو.",
    examples: [
      "Ball Screw",
      "Coupling",
      "Linear Motion",
    ],
  },
  {
    id: "alarm-diagnosis",
    number: "07",
    title: "تشخیص آلارم و خطای CNC",
    description:
      "بررسی کد آلارم، علت‌های محتمل و مسیر اولیه تست برای کنترلر، درایو و تجهیزات.",
    examples: [
      "Alarm Code",
      "Drive Alarm",
      "Controller Fault",
    ],
  },
];