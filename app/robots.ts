import type { MetadataRoute } from "next";

/** Asks every crawler to stay out of the whole site while it is private. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
