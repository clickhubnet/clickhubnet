import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { LeadService } from "@/modules/leads/services/lead.service";

const leadService = new LeadService();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.leadsView);
    const lead = await leadService.get(id, user);

    if (!lead) {
      return NextResponse.json(errorResponse("Lead nao encontrado.", "NOT_FOUND"), { status: 404 });
    }

    return NextResponse.json(successResponse("Lead consultado.", lead));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar o lead."), { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.leadsEdit);
    const body = await request.json();
    const currentLead = await leadService.get(id, user);
    if (!currentLead) {
      return NextResponse.json(errorResponse("Lead nao encontrado.", "NOT_FOUND"), { status: 404 });
    }
    const lead = await leadService.update(id, body, user.id);
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "leads",
      description: `Lead atualizado: ${lead.name}`,
      metadata: { leadId: lead.id },
    });
    return NextResponse.json(successResponse("Lead atualizado.", lead));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }
    return NextResponse.json(errorResponse("Nao foi possivel atualizar o lead."), { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.leadsDelete);
    const currentLead = await leadService.get(id, user);
    if (!currentLead) {
      return NextResponse.json(errorResponse("Lead nao encontrado.", "NOT_FOUND"), { status: 404 });
    }
    const lead = await leadService.delete(id);
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "leads",
      description: `Lead excluido: ${lead.name}`,
      metadata: { leadId: lead.id },
    });
    return NextResponse.json(successResponse("Lead excluido.", lead));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir o lead."), { status: 500 });
  }
}
