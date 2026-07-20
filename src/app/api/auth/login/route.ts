import { NextResponse } from "next/server";
import { z } from "zod";
import { authCookieName } from "@/lib/jwt";
import { errorResponse, successResponse } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { AuthService } from "@/modules/usuarios/services/auth.service";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authService = new AuthService();

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0];
    const userAgent = request.headers.get("user-agent") ?? undefined;
    const rateLimit = checkRateLimit(`login:${ip ?? body.email}`, 10, 60_000);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        errorResponse("Muitas tentativas. Tente novamente em instantes.", "RATE_LIMITED"),
        { status: 429 },
      );
    }

    const result = await authService.login({ ...body, ip, userAgent });
    const response = NextResponse.json(successResponse("Login realizado.", result.user));

    response.cookies.set(authCookieName, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 60 * 60 * 24 * 7),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error", error);
    return NextResponse.json(errorResponse("E-mail ou senha invalidos.", "INVALID_CREDENTIALS"), {
      status: 401,
    });
  }
}
