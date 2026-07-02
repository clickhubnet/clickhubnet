import { NextResponse, type NextRequest } from "next/server";
import { authCookieName, verifyAuthToken } from "@/lib/jwt";

const publicRoutes = ["/login", "/brand", "/api/health", "/api/auth/login", "/api/webhooks/zapi"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(authCookieName)?.value;
  const payload = token ? await verifyAuthToken(token) : null;

  if (!payload) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        {
          status: "error",
          message: "Sessao invalida.",
          code: "UNAUTHORIZED",
          timestamp: new Date().toISOString(),
        },
        { status: 401 },
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
