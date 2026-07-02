import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { PlanService } from "@/modules/n8n/services/plan.service";

const planService = new PlanService();

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!hasPermission(user, permissions.plansEdit)) {
      assertPermission(user, permissions.leadsView);
    }
    const plans = hasPermission(user, permissions.plansEdit)
      ? await planService.list()
      : await planService.listActive();
    return NextResponse.json(successResponse("Planos consultados.", plans));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os planos."), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await requireCurrentUser();
    assertPermission(user, permissions.plansEdit);
    const plan = await planService.create(body);
    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "plans",
      description: `Plano criado: ${plan.name}`,
      metadata: { planId: plan.id },
    });
    return NextResponse.json(successResponse("Plano criado.", plan), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }

    return NextResponse.json(errorResponse("Nao foi possivel criar o plano."), { status: 500 });
  }
}
