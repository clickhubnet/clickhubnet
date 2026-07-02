import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { LeadService } from "@/modules/leads/services/lead.service";

const leadService = new LeadService();
const createStageSchema = z.object({ name: z.string().min(2) });

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.leadsView);
    const stages = await leadService.listStages();
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
    assertPermission(user, permissions.leadsEdit);
    const body = createStageSchema.parse(await request.json());
    const stage = await leadService.createStage(body);
    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "leads",
      description: `Etapa de kanban criada: ${stage.name}`,
      metadata: { stageId: stage.id },
    });
    return NextResponse.json(successResponse("Etapa criada.", stage), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    if (error instanceof ZodError) {
      return NextResponse.json(errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()), {
        status: 422,
      });
    }
    return NextResponse.json(errorResponse("Nao foi possivel criar a etapa."), { status: 500 });
  }
}
