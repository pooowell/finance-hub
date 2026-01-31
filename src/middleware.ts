import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security headers applied to every response.
 * See: https://owasp.org/www-project-secure-headers/
 */
function getSecurityHeaders(): Record<string, string> {
  const isDev = process.env.NODE_ENV === "development";

  // Build CSP directives
  const cspDirectives = [
    "default-src 'self'",
    // Next.js requires 'unsafe-inline' for styles (CSS-in-JS / style tags)
    "style-src 'self' 'unsafe-inline'",
    // Scripts: allow self; unsafe-eval only in dev (Next.js HMR/Fast Refresh)
    `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  return {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": cspDirectives.join("; "),
  };
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const headers = getSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
