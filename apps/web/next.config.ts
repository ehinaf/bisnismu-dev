import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker ringan: server.js + dependensi yang benar-benar dipakai.
  // Root tracing = root monorepo, supaya paket workspace ikut tersalin.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
