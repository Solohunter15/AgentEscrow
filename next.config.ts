import type { NextConfig } from "next";

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.paypal.com https://*.paypalobjects.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.paypalobjects.com",
  "font-src 'self' https://fonts.gstatic.com https://*.paypalobjects.com data:",
  "img-src 'self' data: blob: https://*.paypal.com https://*.paypalobjects.com",
  "connect-src 'self' https://*.paypal.com https://*.sandbox.paypal.com https://*.paypalobjects.com",
  "frame-src 'self' https://*.paypal.com https://*.sandbox.paypal.com https://*.paypalobjects.com",
  "child-src 'self' https://*.paypal.com https://*.sandbox.paypal.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.paypal.com https://*.sandbox.paypal.com",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
