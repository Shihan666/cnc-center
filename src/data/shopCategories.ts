export interface ShopCategory {
  slug: string;
  code: string;
  title: string;
  englishTitle: string;
  description: string;
}

export const shopCategories: ShopCategory[] = [
  {
    slug: "motors",
    code: "01",
    title: "موتورهای CNC",
    englishTitle: "Motors",
    description:
      "سروو موتور، اسپیندل موتور و موتورهای مورد استفاده در ماشین‌آلات CNC.",
  },
  {
    slug: "drives",
    code: "02",
    title: "درایو و سروو درایو",
    englishTitle: "Drives",
    description:
      "Servo Drive، Axis Drive و ماژول‌های کنترل حرکت برندهای صنعتی.",
  },
  {
    slug: "inverter-vfd",
    code: "03",
    title: "اینورتر و VFD",
    englishTitle: "Inverter / VFD",
    description:
      "اینورتر، کنترل دور موتور و تجهیزات راه‌اندازی الکتروموتور صنعتی.",
  },
  {
    slug: "cnc-controllers",
    code: "04",
    title: "کنترلر CNC",
    englishTitle: "CNC Controllers",
    description:
      "کنترلر، CPU، پنل و ماژول‌های مرتبط با سیستم کنترل ماشین CNC.",
  },
  {
    slug: "plc-hmi",
    code: "05",
    title: "PLC و HMI",
    englishTitle: "PLC / HMI",
    description:
      "PLC، پنل اپراتوری، I/O و تجهیزات واسط کنترل و اتوماسیون.",
  },
  {
    slug: "encoders-feedback",
    code: "06",
    title: "انکودر و فیدبک",
    englishTitle: "Encoders / Feedback",
    description:
      "Encoder، Resolver و تجهیزات اندازه‌گیری موقعیت و سرعت محور.",
  },
  {
    slug: "electronic-parts",
    code: "07",
    title: "قطعات الکترونیکی",
    englishTitle: "Electronic Parts",
    description:
      "برد، پاور، ماژول، فن و قطعات الکترونیکی مورد استفاده در CNC.",
  },
  {
    slug: "mechanical-parts",
    code: "08",
    title: "قطعات مکانیکی",
    englishTitle: "Mechanical Parts",
    description:
      "Ball Screw، کوپلینگ، بلبرینگ و قطعات انتقال حرکت و مکانیک دستگاه.",
  },
  {
    slug: "sensors",
    code: "09",
    title: "سنسورها",
    englishTitle: "Sensors",
    description:
      "Proximity، Limit Sensor و تجهیزات تشخیص موقعیت و وضعیت ماشین.",
  },
  {
    slug: "industrial-electrical",
    code: "10",
    title: "برق صنعتی",
    englishTitle: "Industrial Electrical",
    description:
      "کنتاکتور، رله، حفاظت، منبع تغذیه و تجهیزات تابلو برق صنعتی.",
  },
  {
    slug: "cnc-accessories",
    code: "11",
    title: "لوازم جانبی CNC",
    englishTitle: "CNC Accessories",
    description:
      "کابل، کانکتور، فن، باتری و تجهیزات جانبی مورد نیاز دستگاه CNC.",
  },
];