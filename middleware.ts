import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/jwt";

const PUBLIC = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!session) {
    if (isPublic) return NextResponse.next();

    const isTelemetryPath = pathname === "/api/telemetry" || pathname === "/api/metrics/prometheus";
    if (isTelemetryPath) {
      const secret = process.env.METRICS_TOKEN || process.env.TELEMETRY_TOKEN;
      const authHeader = req.headers.get("authorization");
      const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      const headerToken = req.headers.get("x-metrics-token") || bearer;
      const queryToken = req.nextUrl.searchParams.get("token");

      if (secret && (headerToken === secret || queryToken === secret)) {
        return NextResponse.next();
      }

      const isDev = process.env.NODE_ENV !== "production";
      const host = req.headers.get("host") || "";
      const isPrivateOrLocal =
        host.startsWith("localhost") ||
        host.startsWith("127.0.0.1") ||
        host.startsWith("::1") ||
        host.startsWith("[::1]") ||
        host.startsWith("192.168.") ||
        host.startsWith("10.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
        host.startsWith("money-tracker") ||
        host.startsWith("finance-tracker") ||
        host.startsWith("money-web");

      if (!secret && (isDev || isPrivateOrLocal)) {
        return NextResponse.next();
      }
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
