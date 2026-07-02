import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { hasPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { UserService } from "@/modules/usuarios/services/user.service";

const userService = new UserService();

export async function GET() {
  try {
    const user = await requireCurrentUser();
    if (!hasPermission(user, permissions.usersEdit)) {
      assertPermission(user, permissions.leadsView);
      return NextResponse.json(successResponse("Usuarios consultados.", [user]));
    }
    const users = await userService.list();
    return NextResponse.json(successResponse("Usuarios consultados.", users));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os usuarios."), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const currentUser = await requireCurrentUser();
    if (currentUser.role !== "ADMIN") throw new Error("FORBIDDEN");
    assertPermission(currentUser, permissions.usersCreate);
    const createdUser = await userService.create(body);
    await logAudit({
      userId: currentUser.id,
      action: "CREATE",
      module: "users",
      description: `Usuario criado: ${createdUser.name}`,
      metadata: { userId: createdUser.id },
    });
    return NextResponse.json(successResponse("Usuario criado.", createdUser), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }

    return NextResponse.json(errorResponse("Nao foi possivel criar o usuario."), { status: 500 });
  }
}
