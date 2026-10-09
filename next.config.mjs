/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // NextRequest otherwise rewrites loopback IPs to localhost, changing the
  // OAuth callback origin between authorization and token exchange.
  skipMiddlewareUrlNormalize: true,
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: { "/*": ["./scripts/python-index.py"] },
};
export default nextConfig;
