import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { AppointmentService } from "@/modules/compromissos/services/appointment.service";

const appointmentService = new AppointmentService();
const stageSchema = z.object({ name: z.string().min(2) });

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsEdit);
    const body = stageSchema.parse(await request.json());
    const stage = await appointmentService.updateStage(id, body);
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "appointments",
      description: `Etapa de compromissos atualizada: ${stage.name}`,
      metadata: { stageId: stage.id },
    });
    return NextResponse.json(successResponse("Etapa atualizada.", stage));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()), { status: 422 });
    }
    return NextResponse.json(errorResponse("Nao foi possivel atualizar a etapa."), { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsEdit);
    const stage = await appointmentService.deleteStage(id);
    if (!stage) {
      return NextResponse.json(errorResponse("Etapa nao encontrada.", "NOT_FOUND"), { status: 404 });
    }
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "appointments",
      description: `Etapa de compromissos excluida: ${stage.name}`,
      metadata: { stageId: stage.id },
    });
    return NextResponse.json(successResponse("Etapa excluida.", stage));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir a etapa."), { status: 500 });
  }
}
