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
    const logs = await prisma.technicalLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json(successResponse("Logs tecnicos consultados.", logs));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os logs tecnicos."), {
      status: 500,
    });
  }
}
