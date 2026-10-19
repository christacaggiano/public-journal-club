import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf ships its own serverless build of PDF.js; keep it out of the server bundle.
  serverExternalPackages: ["unpdf"],
  turbopack: {
    // PDF.js has an optional Node-only "canvas" dependency that the browser build never uses.
    resolveAlias: { canvas: "./lib/empty-module.ts" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
