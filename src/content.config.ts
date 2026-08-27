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

const productCategorySchema = z.enum([
  "motors",
  "drives",
  "inverter-vfd",
  "cnc-controllers",
  "plc-hmi",
  "encoders-feedback",
  "electronic-parts",
  "mechanical-parts",
  "sensors",
  "industrial-electrical",
  "cnc-accessories",
]);

const productConditionSchema = z.enum([
  "new",
  "used",
  "refurbished",
  "tested",
]);

const productCommerceModeSchema = z.enum([
  "direct-purchase",
  "price-inquiry",
  "sourcing-request",
]);

const productPriceVisibilitySchema = z.enum([
  "visible",
  "hidden",
]);

const productStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

const productShippingClassSchema = z.enum([
  "standard",
  "fragile",
  "heavy",
  "pickup-only",
  "custom",
]);

const productSchema = z
  .object({
    name: z.string(),
    description: z.string(),

    brand: z.string(),
    partNumber: z.string(),
    sku: z.string().optional(),

    category: productCategorySchema,
    subcategory: z.string().optional(),
    series: z.string().optional(),
    manufacturer: z.string().optional(),

    condition: productConditionSchema,

    commerceMode: productCommerceModeSchema,

    priceVisibility: productPriceVisibilitySchema,

    price: z
      .number()
      .nonnegative()
      .optional(),

    priceUnit: z
      .enum([
        "toman",
        "rial",
      ])
      .default("toman"),

    stockQuantity: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    status: productStatusSchema.default("active"),

    featured: z.boolean().default(false),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    leadTime: z.string().optional(),

    warranty: z.string().optional(),

    shippingClass: productShippingClassSchema.default("standard"),

    availabilityNote: z.string().optional(),

    tags: z
      .array(z.string())
      .default([]),

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
  })
  .superRefine((product, context) => {
    if (
      product.priceVisibility === "visible" &&
      product.price === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["price"],
        message:
          "Products with visible pricing must define a price.",
      });
    }

    if (
      product.priceVisibility === "hidden" &&
      product.price !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["price"],
        message:
          "Hidden-price products must not store a public price in content.",
      });
    }

    if (
      product.commerceMode === "direct-purchase" &&
      product.priceVisibility !== "visible"
    ) {
      context.addIssue({
        code: "custom",
        path: ["priceVisibility"],
        message:
          "Direct-purchase products must have visible pricing.",
      });
    }
  });

const products = defineCollection({
  loader: glob({
    base: "./src/content/products",
    pattern: "**/*.{md,mdx}",
  }),

  schema: productSchema,
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

const brandStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

const brands = defineCollection({
  loader: glob({
    base: "./src/content/brands",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z.object({
    name: z.string(),
    description: z.string(),
    focus: z.string(),

    aliases: z
      .array(z.string())
      .default([]),

    logo: z.string().optional(),
    country: z.string().optional(),

    website: z
      .url()
      .optional(),

    status: brandStatusSchema.default("draft"),

    featured: z.boolean().default(false),

    order: z
      .number()
      .int()
      .nonnegative()
      .default(0),

    productCategories: z
      .array(productCategorySchema)
      .default([]),

    relatedServices: z
      .array(z.string())
      .default([]),

    seo: seoSchema.optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Articles
|--------------------------------------------------------------------------
*/

const articleStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

const articleCategorySchema = z.enum([
  "fundamentals",
  "troubleshooting",
  "maintenance",
  "repair",
  "parts",
  "automation",
  "buying-guide",
]);

const articles = defineCollection({
  loader: glob({
    base: "./src/content/articles",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z
    .object({
      title: z.string(),
      excerpt: z.string(),

      status:
        articleStatusSchema.default("draft"),

      category: articleCategorySchema,

      tags: z
        .array(z.string())
        .default([]),

      publishedAt:
        z.coerce.date().optional(),

      updatedAt:
        z.coerce.date().optional(),

      featured:
        z.boolean().default(false),

      order: z
        .number()
        .int()
        .nonnegative()
        .default(0),

      image: z.string().optional(),

      relatedProducts: z
        .array(z.string())
        .default([]),

      relatedServices: z
        .array(z.string())
        .default([]),

      relatedBrands: z
        .array(z.string())
        .default([]),

      relatedAlarms: z
        .array(z.string())
        .default([]),

      relatedRepairs: z
        .array(z.string())
        .default([]),

      seo: seoSchema.optional(),
    })
    .superRefine((article, ctx) => {
      if (
        article.status === "active" &&
        !article.publishedAt
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message:
            "Active articles require a publishedAt date.",
        });
      }

      if (
        article.publishedAt &&
        article.updatedAt &&
        article.updatedAt.getTime() <
          article.publishedAt.getTime()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message:
            "Article updatedAt cannot be earlier than publishedAt.",
        });
      }
    }),
});

/*
|--------------------------------------------------------------------------
| Repair Cases
|--------------------------------------------------------------------------
*/

const repairStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

const repairServiceSchema = z.enum([
  "machine",
  "motion",
  "spindle",
  "control",
  "electronics",
  "mechanical",
  "alarm-diagnosis",
]);

const repairs = defineCollection({
  loader: glob({
    base: "./src/content/repairs",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z
    .object({
      title: z.string(),
      excerpt: z.string(),

      status: repairStatusSchema.default("draft"),

      machine: z.string(),
      manufacturer: z.string().optional(),
      machineModel: z.string().optional(),

      controller: z.string().optional(),

      brand: z.string().optional(),
      component: z.string(),
      partNumber: z.string().optional(),

      alarmCode: z.string().optional(),

      problemSymptoms: z
        .array(z.string())
        .default([]),

      diagnosis: z.string(),
      repairOperation: z.string(),
      result: z.string(),

      beforeImages: z
        .array(z.string())
        .default([]),

      afterImages: z
        .array(z.string())
        .default([]),

      relatedBrands: z
        .array(z.string())
        .default([]),

      relatedProducts: z
        .array(z.string())
        .default([]),

      relatedServices: z
        .array(repairServiceSchema)
        .default([]),

      completedAt: z.coerce.date().optional(),
      publishedAt: z.coerce.date().optional(),

      featured: z.boolean().default(false),

      order: z
        .number()
        .int()
        .nonnegative()
        .default(0),

      seo: seoSchema.optional(),
    })
    .superRefine((repair, ctx) => {
      if (repair.status === "active" && !repair.publishedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message:
            "Active repair records require a publishedAt date.",
        });
      }
    }),
});

/*
|--------------------------------------------------------------------------
| Alarm Center
|--------------------------------------------------------------------------
*/

const alarmStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

const alarmCategorySchema = z.enum([
  "controller",
  "servo",
  "spindle",
  "power",
  "communication",
  "feedback",
  "io",
  "safety",
  "system",
  "other",
]);

const alarmServiceSchema = z.enum([
  "machine",
  "motion",
  "spindle",
  "control",
  "electronics",
  "mechanical",
  "alarm-diagnosis",
]);

const alarms = defineCollection({
  loader: glob({
    base: "./src/content/alarms",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z
    .object({
      title: z.string(),
      excerpt: z.string(),

      status: alarmStatusSchema.default("draft"),

      brand: z.string(),
      code: z.string(),

      aliases: z
        .array(z.string())
        .default([]),

      category: alarmCategorySchema,

      series: z
        .array(z.string())
        .default([]),

      applicableModels: z
        .array(z.string())
        .default([]),

      meaning: z.string(),

      symptoms: z
        .array(z.string())
        .default([]),

      commonCauses: z
        .array(z.string())
        .default([]),

      initialChecks: z
        .array(z.string())
        .default([]),

      safetyNotes: z
        .array(z.string())
        .default([]),

      escalationNotes: z
        .array(z.string())
        .default([]),

      relatedComponents: z
        .array(z.string())
        .default([]),

      relatedBrands: z
        .array(z.string())
        .default([]),

      relatedProducts: z
        .array(z.string())
        .default([]),

      relatedRepairs: z
        .array(z.string())
        .default([]),

      relatedServices: z
        .array(alarmServiceSchema)
        .default([]),

      publishedAt: z.coerce.date().optional(),
      updatedAt: z.coerce.date().optional(),

      featured: z.boolean().default(false),

      order: z
        .number()
        .int()
        .nonnegative()
        .default(0),

      seo: seoSchema.optional(),
    })
    .superRefine((alarm, ctx) => {
      if (alarm.status === "active" && !alarm.publishedAt) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message:
            "Active alarm records require a publishedAt date.",
        });
      }
    }),
});

/*
|--------------------------------------------------------------------------
| FAQ
|--------------------------------------------------------------------------
*/

const faqStatusSchema = z.enum([
  "draft",
  "active",
  "archived",
]);

const faqCategorySchema = z.enum([
  "general",
  "repair",
  "parts",
  "alarms",
  "maintenance",
  "buying",
  "shipping",
  "payment",
]);

const faqs = defineCollection({
  loader: glob({
    base: "./src/content/faqs",
    pattern: "**/*.{md,mdx}",
  }),

  schema: z
    .object({
      question: z.string(),
      answer: z.string(),

      status:
        faqStatusSchema.default("draft"),

      category:
        faqCategorySchema.default("general"),

      featured:
        z.boolean().default(false),

      order: z
        .number()
        .int()
        .nonnegative()
        .default(0),

      publishedAt:
        z.coerce.date().optional(),

      updatedAt:
        z.coerce.date().optional(),

      relatedProducts: z
        .array(z.string())
        .default([]),

      relatedServices: z
        .array(z.string())
        .default([]),

      relatedBrands: z
        .array(z.string())
        .default([]),

      relatedAlarms: z
        .array(z.string())
        .default([]),

      relatedRepairs: z
        .array(z.string())
        .default([]),

      seo: seoSchema.optional(),
    })
    .superRefine((faq, ctx) => {
      if (
        faq.status === "active" &&
        !faq.publishedAt
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message:
            "Active FAQs require a publishedAt date.",
        });
      }

      if (
        faq.publishedAt &&
        faq.updatedAt &&
        faq.updatedAt.getTime() <
          faq.publishedAt.getTime()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message:
            "FAQ updatedAt cannot be earlier than publishedAt.",
        });
      }
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