import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships a native driver for local SQLite files; keep it out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Hide the floating dev-mode badge; it sits on top of the bottom tab bar.
  devIndicators: false,
};

export default nextConfig;
