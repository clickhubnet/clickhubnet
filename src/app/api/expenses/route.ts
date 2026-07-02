import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ExpenseService } from "@/modules/despesas/services/expense.service";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";

const service = new ExpenseService();

export async function GET() {
  try {
    const user = await requireCurrentUser(); assertPermission(user, permissions.expensesView);
    return NextResponse.json(successResponse("Despesas consultadas.", await service.list()));
  } catch (error) { const auth = authErrorResponse(error); if (auth) return auth; return NextResponse.json(errorResponse("Não foi possível consultar as despesas."), { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(); assertPermission(user, permissions.expensesEdit);
    const expense = await service.create(await request.json());
    await logAudit({ userId: user.id, action: "CREATE", module: "expenses", description: `Despesa cadastrada: ${expense.description}` });
    return NextResponse.json(successResponse("Despesa cadastrada.", expense), { status: 201 });
  } catch (error) { const auth = authErrorResponse(error); if (auth) return auth; if (error instanceof ZodError) return NextResponse.json(errorResponse("Dados inválidos.", "VALIDATION_ERROR", error.flatten()), { status: 422 }); return NextResponse.json(errorResponse("Não foi possível cadastrar a despesa."), { status: 500 }); }
}
