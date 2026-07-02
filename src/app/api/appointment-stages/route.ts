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

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsView);
    const stages = await appointmentService.listStages();
    return NextResponse.json(successResponse("Etapas consultadas.", stages));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar as etapas."), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsEdit);
    const body = stageSchema.parse(await request.json());
    const stage = await appointmentService.createStage(body);
    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "appointments",
      description: `Etapa de compromissos criada: ${stage.name}`,
      metadata: { stageId: stage.id },
    });
    return NextResponse.json(successResponse("Etapa criada.", stage), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()), { status: 422 });
    }
    return NextResponse.json(errorResponse("Nao foi possivel criar a etapa."), { status: 500 });
  }
}
