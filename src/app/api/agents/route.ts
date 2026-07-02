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

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.agentsEdit);
    const agents = await agentService.list();
    return NextResponse.json(successResponse("Agentes consultados.", agents));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os agentes."), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await requireCurrentUser();
    assertPermission(user, permissions.agentsCreate);
    const agent = await agentService.create(body);
    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "agents",
      description: `Agente criado: ${agent.name}`,
      metadata: { agentId: agent.id },
    });
    return NextResponse.json(successResponse("Agente criado.", agent), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }

    return NextResponse.json(errorResponse("Nao foi possivel criar o agente."), { status: 500 });
  }
}
