import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { getCepImportJob, startCepImportJob } from "@/modules/ceps/services/cep-import-jobs";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    assertPermission(user, permissions.cepsImport);

    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json(errorResponse("Informe o jobId.", "JOB_ID_REQUIRED"), { status: 400 });
    }

    const job = getCepImportJob(jobId);
    if (!job) {
      return NextResponse.json(errorResponse("Importação não encontrada.", "JOB_NOT_FOUND"), { status: 404 });
    }

    return NextResponse.json(successResponse("Status da importação consultado.", job));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar a importacao."), { status: 500 });
  }
}

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
    const job = startCepImportJob({ buffer, fileName: file.name, userId: user.id });

    return NextResponse.json(successResponse("Importação iniciada em segundo plano.", job), { status: 202 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel iniciar a importacao da base de CEPs."), {
      status: 500,
    });
  }
}
