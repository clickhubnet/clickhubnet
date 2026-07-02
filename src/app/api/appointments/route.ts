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

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsView);
    const appointments = await appointmentService.list(user);
    return NextResponse.json(successResponse("Compromissos consultados.", appointments));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os compromissos."), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await requireCurrentUser();
    assertPermission(user, permissions.appointmentsCreate);
    const appointment = await appointmentService.create(body, user);
    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "appointments",
      description: `Compromisso criado: ${appointment.title}`,
      metadata: { appointmentId: appointment.id },
    });
    return NextResponse.json(successResponse("Compromisso criado.", appointment), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }

    return NextResponse.json(errorResponse("Nao foi possivel criar o compromisso."), {
      status: 500,
    });
  }
}
