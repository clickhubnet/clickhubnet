import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { PlanService } from "@/modules/n8n/services/plan.service";

const planService = new PlanService();

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.plansEdit);
    const body = await request.json();
    const plan = await planService.update(id, body);
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "plans",
      description: `Plano atualizado: ${plan.name}`,
      metadata: { planId: plan.id },
    });
    return NextResponse.json(successResponse("Plano atualizado.", plan));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }
    return NextResponse.json(errorResponse("Nao foi possivel atualizar o plano."), { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.plansEdit);
    const plan = await planService.delete(id);
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "plans",
      description: `Plano excluido: ${plan.name}`,
      metadata: { planId: plan.id },
    });
    return NextResponse.json(successResponse("Plano excluido.", plan));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir o plano."), { status: 500 });
  }
}
