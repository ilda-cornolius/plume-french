import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sql.js", "@electric-sql/pglite"],
};

export default nextConfig;
