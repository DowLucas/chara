import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { SITE_URL as BASE_URL } from "@/lib/site";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/splitwise-alternative", changefreq: "monthly", priority: "0.9" },
          { path: "/vs/splitwise", changefreq: "monthly", priority: "0.8" },
          { path: "/vs/tricount", changefreq: "monthly", priority: "0.7" },
          { path: "/vs/settle-up", changefreq: "monthly", priority: "0.7" },
          { path: "/vs/splid", changefreq: "monthly", priority: "0.7" },
          { path: "/vs/steven", changefreq: "monthly", priority: "0.7" },
          { path: "/switch-from-splitwise", changefreq: "monthly", priority: "0.8" },
          { path: "/splitwise-daily-limit", changefreq: "monthly", priority: "0.7" },
          { path: "/self-host", changefreq: "monthly", priority: "0.8" },
          { path: "/releases", changefreq: "weekly", priority: "0.6" },
          { path: "/privacy", changefreq: "monthly", priority: "0.5" },
          { path: "/terms", changefreq: "monthly", priority: "0.5" },
          { path: "/cookies", changefreq: "monthly", priority: "0.4" },
          { path: "/dpa", changefreq: "monthly", priority: "0.4" },
          { path: "/security", changefreq: "monthly", priority: "0.5" },
          { path: "/support", changefreq: "monthly", priority: "0.5" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
