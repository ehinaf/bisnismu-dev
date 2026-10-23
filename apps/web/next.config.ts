import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker ringan: server.js + dependensi yang benar-benar dipakai.
  // Root tracing = root monorepo, supaya paket workspace ikut tersalin.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Dev: /api/* diteruskan ke API (meniru Caddy di produksi), jadi web bisa
  // dibuka dari localhost, IP LAN, atau HP tanpa urusan CORS. Di produksi
  // API_PROXY_TARGET kosong — Caddy yang menangani /api.
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    return target ? [{ source: "/api/:path*", destination: `${target}/:path*` }] : [];
  },
};

export default nextConfig;
