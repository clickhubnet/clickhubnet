import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, verifyAuthToken } from "@/lib/jwt";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const token = (await cookies()).get(authCookieName)?.value;
  const payload = token ? await verifyAuthToken(token) : null;

  if (!payload) {
    return NextResponse.json(errorResponse("Sessao invalida.", "UNAUTHORIZED"), { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      permissions: true,
      avatarUrl: true,
      theme: true,
    },
  });

  if (!user) {
    return NextResponse.json(errorResponse("Usuario nao encontrado.", "UNAUTHORIZED"), {
      status: 401,
    });
  }

  return NextResponse.json(successResponse("Sessao consultada.", user));
}
