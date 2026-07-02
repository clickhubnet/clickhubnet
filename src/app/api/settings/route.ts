import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { SettingsService } from "@/modules/configuracoes/services/settings.service";

const settingsService = new SettingsService();

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.settingsView);
    const settings = await settingsService.list();
    return NextResponse.json(successResponse("Configuracoes consultadas.", settings));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar as configuracoes."), {
      status: 500,
    });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.settingsEdit);
    const body = (await request.json()) as Record<string, Prisma.InputJsonValue>;
    const settings = await settingsService.update(body);
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "settings",
      description: "Configuracoes atualizadas.",
      metadata: { keys: Object.keys(body) },
    });
    return NextResponse.json(successResponse("Configuracoes atualizadas.", settings));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel atualizar as configuracoes."), {
      status: 500,
    });
  }
}
