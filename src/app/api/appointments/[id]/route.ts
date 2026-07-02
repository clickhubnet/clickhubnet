import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { AppointmentService } from "@/modules/compromissos/services/appointment.service";

const appointmentService = new AppointmentService();

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsEdit);
    const body = await request.json();
    const current = await appointmentService.get(id, user);
    if (!current) {
      return NextResponse.json(errorResponse("Compromisso nao encontrado.", "NOT_FOUND"), { status: 404 });
    }
    const appointment = await appointmentService.update(id, body);
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "appointments",
      description: `Compromisso atualizado: ${appointment.title}`,
      metadata: { appointmentId: appointment.id },
    });
    return NextResponse.json(successResponse("Compromisso atualizado.", appointment));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }
    return NextResponse.json(errorResponse("Nao foi possivel atualizar o compromisso."), {
      status: 500,
    });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsDelete);
    const current = await appointmentService.get(id, user);
    if (!current) {
      return NextResponse.json(errorResponse("Compromisso nao encontrado.", "NOT_FOUND"), { status: 404 });
    }
    const appointment = await appointmentService.delete(id);
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "appointments",
      description: `Compromisso excluido: ${appointment.title}`,
      metadata: { appointmentId: appointment.id },
    });
    return NextResponse.json(successResponse("Compromisso excluido.", appointment));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir o compromisso."), {
      status: 500,
    });
  }
}
