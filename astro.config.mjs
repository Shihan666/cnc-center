// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

const developmentSiteUrl =
  'http://localhost:4321';

const loadedEnv =
  loadEnv(
    process.env.NODE_ENV ?? 'development',
    process.cwd(),
    '',
  );

function resolveSiteUrl() {
  const configuredSiteUrl =
    (
      process.env.PUBLIC_SITE_URL ??
      loadedEnv.PUBLIC_SITE_URL ??
      ''
    ).trim();

  if (!configuredSiteUrl) {
    return developmentSiteUrl;
  }

  let parsedUrl;

  try {
    parsedUrl =
      new URL(configuredSiteUrl);
  } catch {
    throw new Error(
      'PUBLIC_SITE_URL must be a valid absolute URL.',
    );
  }

  if (
    parsedUrl.protocol !== 'http:' &&
    parsedUrl.protocol !== 'https:'
  ) {
    throw new Error(
      'PUBLIC_SITE_URL must use http or https.',
    );
  }

  if (
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      'PUBLIC_SITE_URL must contain only the site origin, without a path, query, or hash.',
    );
  }

  return parsedUrl.origin;
}

const site =
  resolveSiteUrl();

const excludedSitemapPaths =
  new Set([
    '/404.html',
    '/cart/',
    '/checkout/',
  ]);

// https://astro.build/config
export default defineConfig({
  site,

  output: 'server',

  adapter: node({
    mode: 'standalone',
  }),

  session: false,

  integrations: [
    react(),

    sitemap({
      filter: (page) =>
        !excludedSitemapPaths.has(
          new URL(page).pathname,
        ),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
});
