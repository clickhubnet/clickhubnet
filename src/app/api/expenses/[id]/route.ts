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
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireCurrentUser(); assertPermission(user, permissions.expensesEdit);
    const { id } = await context.params; const expense = await service.update(id, await request.json());
    await logAudit({ userId: user.id, action: "UPDATE", module: "expenses", description: `Despesa atualizada: ${expense.description}` });
    return NextResponse.json(successResponse("Despesa atualizada.", expense));
  } catch (error) { const auth = authErrorResponse(error); if (auth) return auth; if (error instanceof ZodError) return NextResponse.json(errorResponse("Dados inválidos.", "VALIDATION_ERROR", error.flatten()), { status: 422 }); return NextResponse.json(errorResponse("Não foi possível atualizar a despesa."), { status: 500 }); }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const user = await requireCurrentUser(); assertPermission(user, permissions.expensesDelete);
    const { id } = await context.params; const expense = await service.delete(id);
    await logAudit({ userId: user.id, action: "DELETE", module: "expenses", description: `Despesa excluída: ${expense.description}` });
    return NextResponse.json(successResponse("Despesa excluída.", expense));
  } catch (error) { const auth = authErrorResponse(error); if (auth) return auth; return NextResponse.json(errorResponse("Não foi possível excluir a despesa."), { status: 500 }); }
}
