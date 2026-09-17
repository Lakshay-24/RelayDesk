import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/pair", "/auth", "/oauth"],
    },
    sitemap: "https://relay-desk-mjq6.vercel.app/sitemap.xml",
    host: "https://relay-desk-mjq6.vercel.app",
  };
}
