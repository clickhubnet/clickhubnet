import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { UserService } from "@/modules/usuarios/services/user.service";

const userService = new UserService();

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const currentUser = await requireCurrentUser();
    if (currentUser.role !== "ADMIN") throw new Error("FORBIDDEN");
    assertPermission(currentUser, permissions.usersEdit);
    const body = await request.json();
    if (id === currentUser.id && (body.status === "BLOCKED" || body.role === "EMPLOYEE")) {
      return NextResponse.json(errorResponse("Você não pode bloquear ou remover seu próprio acesso administrativo."), { status: 422 });
    }
    const updatedUser = await userService.update(id, body);
    await logAudit({
      userId: currentUser.id,
      action: "UPDATE",
      module: "users",
      description: `Usuario atualizado: ${updatedUser.name}`,
      metadata: { userId: updatedUser.id },
    });
    return NextResponse.json(successResponse("Usuario atualizado.", updatedUser));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }
    return NextResponse.json(errorResponse("Nao foi possivel atualizar o usuario."), {
      status: 500,
    });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const currentUser = await requireCurrentUser();
    if (currentUser.role !== "ADMIN") throw new Error("FORBIDDEN");
    assertPermission(currentUser, permissions.usersBlock);
    if (id === currentUser.id) {
      return NextResponse.json(errorResponse("Você não pode excluir a própria conta."), { status: 422 });
    }
    const deletedUser = await userService.delete(id);
    await logAudit({
      userId: currentUser.id,
      action: "DELETE",
      module: "users",
      description: `Usuario excluido: ${deletedUser.name}`,
      metadata: { userId: deletedUser.id },
    });
    return NextResponse.json(successResponse("Usuario excluido.", deletedUser));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir o usuario."), { status: 500 });
  }
}
