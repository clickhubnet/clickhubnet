import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "A nova senha deve ser diferente da senha atual.",
  path: ["newPassword"],
});

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = schema.parse(await request.json());

    if (!user.passwordHash || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      return NextResponse.json(errorResponse("Senha atual invalida.", "INVALID_PASSWORD"), {
        status: 400,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(body.newPassword),
        passwordChangedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_CHANGE",
        module: "profile",
        description: "Senha alterada pelo usuario.",
      },
    });

    return NextResponse.json(successResponse("Senha alterada.", { ok: true }));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        errorResponse("Dados invalidos.", "VALIDATION_ERROR", error.flatten()),
        { status: 422 },
      );
    }

    return NextResponse.json(errorResponse("Nao foi possivel alterar a senha."), { status: 500 });
  }
}
