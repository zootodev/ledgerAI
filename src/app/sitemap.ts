import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/constants";

/**
 * `/sitemap.xml`. Lists only the genuinely public, indexable pages - the
 * marketing landing page plus the legal documents. The authenticated app and
 * the hidden Ask surfaces are intentionally absent (and disallowed in
 * `robots.ts`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const abs = (path: string) => new URL(path, base).toString();

  return [
    {
      url: abs("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: abs("/privacy"),
      lastModified: PRIVACY_VERSION,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: abs("/terms"),
      lastModified: TERMS_VERSION,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
