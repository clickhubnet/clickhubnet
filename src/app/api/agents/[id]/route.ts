import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { AgentService } from "@/modules/n8n/services/agent.service";

const agentService = new AgentService();

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.agentsEdit);
    const body = await request.json();
    const agent = await agentService.update(id, body);
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "agents",
      description: `Agente atualizado: ${agent.name}`,
      metadata: { agentId: agent.id },
    });
    return NextResponse.json(successResponse("Agente atualizado.", agent));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }
    return NextResponse.json(errorResponse("Nao foi possivel atualizar o agente."), {
      status: 500,
    });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const user = await requireCurrentUser();
    assertPermission(user, permissions.agentsEdit);
    const agent = await agentService.delete(id);
    await logAudit({
      userId: user.id,
      action: "DELETE",
      module: "agents",
      description: `Agente excluido: ${agent.name}`,
      metadata: { agentId: agent.id },
    });
    return NextResponse.json(successResponse("Agente excluido.", agent));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir o agente."), { status: 500 });
  }
}
