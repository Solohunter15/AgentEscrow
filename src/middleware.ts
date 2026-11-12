import { NextRequest, NextResponse } from "next/server";
import {
  checkRateLimit,
  isTrustedBrowserOrigin,
} from "@/lib/security/rate-limit";

const MAX_API_BODY_BYTES = 262_144; // 256 KB

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    return fwd.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // PayPal webhooks are server-to-server from PayPal and verified cryptographically in route handler
  const isWebhook = pathname.startsWith("/api/webhooks/");

  if (
    !isWebhook &&
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.method !== "OPTIONS"
  ) {
    if (!isTrustedBrowserOrigin(req.headers)) {
      return NextResponse.json(
        { error: "Cross-origin request blocked by CSRF policy" },
        { status: 403 }
      );
    }

    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body exceeds maximum allowed size (256 KB)" },
        { status: 413 }
      );
    }
  }

  const ip = getClientIp(req);
  const isAiRoute =
    pathname.startsWith("/api/escrows/draft") ||
    pathname.startsWith("/api/ai/") ||
    pathname.endsWith("/submit");

  const limit = checkRateLimit({
    key: `${isAiRoute ? "ai" : "api"}:${ip}`,
    maxRequests: isAiRoute ? 30 : 120,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down and try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSec),
        },
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

