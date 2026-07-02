import { NextResponse } from "next/server";
import { authCookieName, verifyAuthToken } from "@/lib/jwt";
import { successResponse } from "@/lib/api-response";
import { AuthService } from "@/modules/usuarios/services/auth.service";

const authService = new AuthService();

export async function POST(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${authCookieName}=`))
    ?.split("=")[1];

  const payload = token ? await verifyAuthToken(token) : null;
  await authService.logout(
    payload?.sub,
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("user-agent") ?? undefined,
  );

  const response = NextResponse.json(successResponse("Logout realizado.", { ok: true }));
  response.cookies.set(authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });
  return response;
}
