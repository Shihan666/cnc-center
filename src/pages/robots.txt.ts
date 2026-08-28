import type {
  APIRoute,
} from "astro";

function getRobotsTxt(
  sitemapUrl: URL,
) {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitemapUrl.href}`,
    "",
  ].join("\n");
}

export const GET: APIRoute =
  ({ site }) => {
    if (!site) {
      throw new Error(
        "Astro site config is required to generate robots.txt.",
      );
    }

    const sitemapUrl =
      new URL(
        "sitemap-index.xml",
        site,
      );

    return new Response(
      getRobotsTxt(sitemapUrl),
      {
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8",
        },
      },
    );
  };
