import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/*
|--------------------------------------------------------------------------
| Shared Schemas
|--------------------------------------------------------------------------
*/

const seoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  canonical: z.string().optional(),
  noindex: z.boolean().default(false),
});

/*
|--------------------------------------------------------------------------
| Products
|--------------------------------------------------------------------------
*/

const products = defineCollection({
  loader: glob({
    base: "./src/content/products",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    name: z.string(),
    description: z.string(),

    brand: z.string(),
    partNumber: z.string(),
    sku: z.string().optional(),

    category: z.string(),
    subcategory: z.string().optional(),
    series: z.string().optional(),
    manufacturer: z.string().optional(),

    condition: z.enum([
      "new",
      "used",
      "refurbished",
      "tested",
    ]),

    commerceMode: z.enum([
      "direct-purchase",
      "price-inquiry",
      "sourcing-request",
    ]),

    priceVisibility: z.enum([
      "visible",
      "hidden",
    ]),

    price: z.number().nonnegative().optional(),

    stockQuantity: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    featured: z.boolean().default(false),

    images: z
      .array(z.string())
      .default([]),

    specifications: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      )
      .default([]),

    compatibility: z
      .array(z.string())
      .default([]),

    relatedProducts: z
      .array(z.string())
      .default([]),

    relatedServices: z
      .array(z.string())
      .default([]),

    documents: z
      .array(
        z.object({
          type: z.enum([
            "manual",
            "datasheet",
            "catalog",
          ]),
          title: z.string(),
          url: z.string(),
        }),
      )
      .default([]),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Services
|--------------------------------------------------------------------------
*/

const services = defineCollection({
  loader: glob({
    base: "./src/content/services",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    title: z.string(),
    description: z.string(),

    category: z.enum([
      "machine",
      "motion",
      "spindle",
      "control",
      "electronics",
      "mechanical",
      "alarm-diagnosis",
    ]),

    featured: z.boolean().default(false),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    relatedProducts: z
      .array(z.string())
      .default([]),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Brands
|--------------------------------------------------------------------------
*/

const brands = defineCollection({
  loader: glob({
    base: "./src/content/brands",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    name: z.string(),
    description: z.string(),

    logo: z.string().optional(),
    country: z.string().optional(),
    website: z.string().optional(),

    featured: z.boolean().default(false),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Articles
|--------------------------------------------------------------------------
*/

const articles = defineCollection({
  loader: glob({
    base: "./src/content/articles",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    title: z.string(),
    excerpt: z.string(),

    category: z.string(),

    tags: z
      .array(z.string())
      .default([]),

    publishedAt: z.coerce.date(),

    updatedAt: z
      .coerce
      .date()
      .optional(),

    featured: z.boolean().default(false),

    image: z.string().optional(),

    relatedProducts: z
      .array(z.string())
      .default([]),

    relatedServices: z
      .array(z.string())
      .default([]),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Repair Cases
|--------------------------------------------------------------------------
*/

const repairs = defineCollection({
  loader: glob({
    base: "./src/content/repairs",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    title: z.string(),
    excerpt: z.string(),

    machine: z.string(),
    manufacturer: z.string().optional(),
    controller: z.string().optional(),

    component: z.string(),

    alarmCode: z.string().optional(),

    diagnosis: z.string(),
    repairOperation: z.string(),
    result: z.string(),

    beforeImages: z
      .array(z.string())
      .default([]),

    afterImages: z
      .array(z.string())
      .default([]),

    relatedProducts: z
      .array(z.string())
      .default([]),

    relatedServices: z
      .array(z.string())
      .default([]),

    publishedAt: z.coerce.date(),

    featured: z.boolean().default(false),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Alarm Center
|--------------------------------------------------------------------------
*/

const alarms = defineCollection({
  loader: glob({
    base: "./src/content/alarms",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    title: z.string(),

    brand: z.string(),
    code: z.string(),

    meaning: z.string(),

    commonCauses: z
      .array(z.string())
      .default([]),

    initialChecks: z
      .array(z.string())
      .default([]),

    relatedComponents: z
      .array(z.string())
      .default([]),

    relatedServices: z
      .array(z.string())
      .default([]),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| FAQ
|--------------------------------------------------------------------------
*/

const faqs = defineCollection({
  loader: glob({
    base: "./src/content/faqs",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    question: z.string(),
    answer: z.string(),

    category: z.string().default("general"),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),
  }),
});

/*
|--------------------------------------------------------------------------
| Export Collections
|--------------------------------------------------------------------------
*/

export const collections = {
  products,
  services,
  brands,
  articles,
  repairs,
  alarms,
  faqs,
};
