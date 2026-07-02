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

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.leadsView);
    const leads = await leadService.list(user);
    return NextResponse.json(successResponse("Leads consultados.", leads));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os leads."), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.leadsCreate);
    const body = await request.json();
    const lead = await leadService.create({
      ...body,
      assignedUserId: user.role === "EMPLOYEE" ? user.id : body.assignedUserId,
    });
    await logAudit({
      userId: user.id,
      action: "CREATE",
      module: "leads",
      description: `Lead criado: ${lead.name}`,
      metadata: { leadId: lead.id },
    });
    return NextResponse.json(successResponse("Lead criado.", lead), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }

    return NextResponse.json(errorResponse("Nao foi possivel criar o lead."), { status: 500 });
  }
}
