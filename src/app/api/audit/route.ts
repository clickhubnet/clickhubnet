import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { permissions } from "@/constants/permissions";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.settingsView);
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
      take: 100,
    });
    return NextResponse.json(successResponse("Auditoria consultada.", logs));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar a auditoria."), {
      status: 500,
    });
  }
}
