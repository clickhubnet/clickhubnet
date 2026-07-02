import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { CepImportService } from "@/modules/ceps/services/cep-import.service";

const cepImportService = new CepImportService();

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    assertPermission(user, permissions.cepsImport);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Arquivo nao enviado.", "FILE_REQUIRED"), {
        status: 400,
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await cepImportService.importFromBuffer(buffer, file.name);
    await logAudit({
      userId: user.id,
      action: "IMPORT",
      module: "ceps",
      description: `Base de CEPs importada: ${file.name}`,
      metadata: result,
    });

    return NextResponse.json(successResponse("Base de CEPs importada.", result));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel importar a base de CEPs."), {
      status: 500,
    });
  }
}
