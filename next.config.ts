import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sql.js", "@electric-sql/pglite"],
  // Cursor Try Live / embedded browser often use 127.0.0.1 while `next dev`
  // defaults to localhost — without this, client JS/HMR is blocked and inputs
  // never hydrate (stuck “restoring…”, can’t type).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
