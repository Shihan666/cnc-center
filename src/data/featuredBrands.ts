export interface FeaturedBrand {
  name: string;
  slug: string;
  focus: string;
}

export const featuredBrands: FeaturedBrand[] = [
  {
    name: "FANUC",
    slug: "fanuc",
    focus: "کنترلر، سروو، درایو و اسپیندل",
  },
  {
    name: "SIEMENS",
    slug: "siemens",
    focus: "کنترل CNC، درایو، PLC و HMI",
  },
  {
    name: "MITSUBISHI",
    slug: "mitsubishi",
    focus: "سروو، درایو، کنترل و اتوماسیون",
  },
  {
    name: "HEIDENHAIN",
    slug: "heidenhain",
    focus: "کنترل CNC، انکودر و فیدبک",
  },
  {
    name: "YASKAWA",
    slug: "yaskawa",
    focus: "سروو موتور و سروو درایو",
  },
  {
    name: "DELTA",
    slug: "delta",
    focus: "سروو، اینورتر، PLC و HMI",
  },
  {
    name: "OMRON",
    slug: "omron",
    focus: "اتوماسیون، سنسور و تجهیزات کنترل",
  },
  {
    name: "SCHNEIDER",
    slug: "schneider",
    focus: "برق صنعتی، درایو و اتوماسیون",
  },
];