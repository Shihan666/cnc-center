export interface ShopCategory {
  slug: string;
  code: string;
  title: string;
  englishTitle: string;
  description: string;
  intro: string;
  typicalItems: string[];
  buyingNotes: string[];
}

export const shopCategories: ShopCategory[] = [
  {
    slug: "motors",
    code: "01",
    title: "موتورهای CNC",
    englishTitle: "Motors",
    description:
      "سروو موتور، اسپیندل موتور و موتورهای مورد استفاده در ماشین‌آلات CNC.",
    intro:
      "انتخاب موتور مناسب نیازمند تطبیق مدل، توان، فیدبک، نوع فلنج، شفت و سازگاری با درایو یا کنترل موجود است.",
    typicalItems: [
      "Servo Motor",
      "Spindle Motor",
      "Axis Motor",
      "Industrial Motor",
    ],
    buyingNotes: [
      "برند و مدل کامل موتور",
      "Part Number روی پلاک",
      "توان، ولتاژ و جریان",
      "مدل درایو متصل",
    ],
  },
  {
    slug: "drives",
    code: "02",
    title: "درایو و سروو درایو",
    englishTitle: "Drives",
    description:
      "Servo Drive، Axis Drive و ماژول‌های کنترل حرکت برندهای صنعتی.",
    intro:
      "درایو باید از نظر سری، توان، نوع شبکه، فیدبک و سازگاری با موتور و کنترلر دستگاه به‌دقت بررسی شود.",
    typicalItems: [
      "Servo Drive",
      "Axis Drive",
      "Amplifier",
      "Motion Module",
    ],
    buyingNotes: [
      "Part Number کامل درایو",
      "مدل سروو موتور",
      "کد آلارم در صورت خرابی",
      "مشخصات تغذیه و توان",
    ],
  },
  {
    slug: "inverter-vfd",
    code: "03",
    title: "اینورتر و VFD",
    englishTitle: "Inverter / VFD",
    description:
      "اینورتر، کنترل دور موتور و تجهیزات راه‌اندازی الکتروموتور صنعتی.",
    intro:
      "برای انتخاب اینورتر، توان موتور، ولتاژ ورودی، جریان، نوع کاربرد و روش کنترل باید با مدل پیشنهادی تطبیق داده شود.",
    typicalItems: [
      "VFD",
      "Inverter",
      "Frequency Drive",
      "Braking Unit",
    ],
    buyingNotes: [
      "توان موتور",
      "ولتاژ ورودی",
      "جریان نامی",
      "نوع کاربرد و بار",
    ],
  },
  {
    slug: "cnc-controllers",
    code: "04",
    title: "کنترلر CNC",
    englishTitle: "CNC Controllers",
    description:
      "کنترلر، CPU، پنل و ماژول‌های مرتبط با سیستم کنترل ماشین CNC.",
    intro:
      "کنترلرهای CNC معمولاً سری‌ها و نسل‌های متنوعی دارند و انتخاب جایگزین بدون بررسی دقیق مدل و ماژول‌های متصل توصیه نمی‌شود.",
    typicalItems: [
      "CNC Control",
      "CPU",
      "Operator Panel",
      "Control Module",
    ],
    buyingNotes: [
      "برند و سری کنترل",
      "Part Number کامل",
      "مدل پنل یا CPU",
      "تصویر پلاک و کانکتورها",
    ],
  },
  {
    slug: "plc-hmi",
    code: "05",
    title: "PLC و HMI",
    englishTitle: "PLC / HMI",
    description:
      "PLC، پنل اپراتوری، I/O و تجهیزات واسط کنترل و اتوماسیون.",
    intro:
      "در PLC و HMI علاوه بر مدل سخت‌افزار، نسخه، نوع ارتباط، تعداد I/O و سازگاری نرم‌افزاری اهمیت دارد.",
    typicalItems: [
      "PLC",
      "HMI",
      "I/O Module",
      "Communication Module",
    ],
    buyingNotes: [
      "مدل CPU یا پنل",
      "Part Number",
      "نوع ارتباط",
      "تعداد و نوع I/O",
    ],
  },
  {
    slug: "encoders-feedback",
    code: "06",
    title: "انکودر و فیدبک",
    englishTitle: "Encoders / Feedback",
    description:
      "Encoder، Resolver و تجهیزات اندازه‌گیری موقعیت و سرعت محور.",
    intro:
      "رزولوشن، نوع سیگنال، کانکتور، نحوه نصب و سازگاری با موتور یا درایو از مشخصات مهم انتخاب تجهیزات فیدبک هستند.",
    typicalItems: [
      "Encoder",
      "Resolver",
      "Pulse Coder",
      "Feedback Sensor",
    ],
    buyingNotes: [
      "Part Number",
      "نوع سیگنال خروجی",
      "رزولوشن",
      "نوع کانکتور و نصب",
    ],
  },
  {
    slug: "electronic-parts",
    code: "07",
    title: "قطعات الکترونیکی",
    englishTitle: "Electronic Parts",
    description:
      "برد، پاور، ماژول، فن و قطعات الکترونیکی مورد استفاده در CNC.",
    intro:
      "در قطعات الکترونیکی، تطبیق Part Number و Revision اهمیت زیادی دارد و ظاهر مشابه الزاماً به معنی سازگاری نیست.",
    typicalItems: [
      "PCB",
      "Power Supply",
      "Control Board",
      "Cooling Fan",
    ],
    buyingNotes: [
      "Part Number برد",
      "Revision یا Version",
      "تصویر کامل برد",
      "مدل دستگاه یا کنترل",
    ],
  },
  {
    slug: "mechanical-parts",
    code: "08",
    title: "قطعات مکانیکی",
    englishTitle: "Mechanical Parts",
    description:
      "Ball Screw، کوپلینگ، بلبرینگ و قطعات انتقال حرکت و مکانیک دستگاه.",
    intro:
      "ابعاد، گام، قطر، نوع اتصال و دقت مورد نیاز در انتخاب قطعات مکانیکی CNC تعیین‌کننده هستند.",
    typicalItems: [
      "Ball Screw",
      "Coupling",
      "Bearing",
      "Linear Motion Part",
    ],
    buyingNotes: [
      "ابعاد دقیق قطعه",
      "مدل یا کد سازنده",
      "گام و قطر در Ball Screw",
      "تصویر محل نصب",
    ],
  },
  {
    slug: "sensors",
    code: "09",
    title: "سنسورها",
    englishTitle: "Sensors",
    description:
      "Proximity، Limit Sensor و تجهیزات تشخیص موقعیت و وضعیت ماشین.",
    intro:
      "نوع سنسور، فاصله تشخیص، ولتاژ، نوع خروجی و شکل نصب باید با مدار و کاربرد دستگاه هماهنگ باشد.",
    typicalItems: [
      "Proximity Sensor",
      "Limit Sensor",
      "Photoelectric Sensor",
      "Position Sensor",
    ],
    buyingNotes: [
      "ولتاژ کاری",
      "نوع خروجی PNP یا NPN",
      "فاصله تشخیص",
      "مدل و ابعاد نصب",
    ],
  },
  {
    slug: "industrial-electrical",
    code: "10",
    title: "برق صنعتی",
    englishTitle: "Industrial Electrical",
    description:
      "کنتاکتور، رله، حفاظت، منبع تغذیه و تجهیزات تابلو برق صنعتی.",
    intro:
      "تجهیزات برق صنعتی باید بر اساس ولتاژ، جریان، ظرفیت قطع، نوع فرمان و شرایط تابلو انتخاب شوند.",
    typicalItems: [
      "Contactor",
      "Relay",
      "Power Supply",
      "Protection Device",
    ],
    buyingNotes: [
      "ولتاژ بوبین یا تغذیه",
      "جریان نامی",
      "تعداد کنتاکت",
      "برند و سری موجود",
    ],
  },
  {
    slug: "cnc-accessories",
    code: "11",
    title: "لوازم جانبی CNC",
    englishTitle: "CNC Accessories",
    description:
      "کابل، کانکتور، فن، باتری و تجهیزات جانبی مورد نیاز دستگاه CNC.",
    intro:
      "لوازم جانبی CNC معمولاً وابستگی مستقیم به مدل کنترل، درایو یا تجهیز دارند و بهتر است با Part Number یا تصویر دقیق بررسی شوند.",
    typicalItems: [
      "Cable",
      "Connector",
      "Battery",
      "Cooling Fan",
    ],
    buyingNotes: [
      "Part Number در صورت وجود",
      "نوع کانکتور",
      "طول یا ابعاد",
      "مدل تجهیز مرتبط",
    ],
  },
];