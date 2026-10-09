/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // NextRequest otherwise rewrites loopback IPs to localhost, changing the
  // OAuth callback origin between authorization and token exchange.
  skipMiddlewareUrlNormalize: true,
  serverExternalPackages: ["better-sqlite3", "web-tree-sitter"],
  outputFileTracingIncludes: {
    "/*": [
      "./scripts/python-index.py",
      "./scripts/syntax-index.mjs",
      "./scripts/grammars/*",
      "./node_modules/web-tree-sitter/**",
    ],
  },
};
export default nextConfig;
