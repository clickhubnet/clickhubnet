import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { CepImportService } from "@/modules/ceps/services/cep-import.service";

export const maxDuration = 300;

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
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    const send = async (data: Record<string, unknown>) => {
      await writer.write(encoder.encode(`${JSON.stringify(data)}\n`));
    };

    void (async () => {
      try {
        const service = new CepImportService();
        await send({
          status: "running",
          progress: 0,
          processed: 0,
          total: 0,
          imported: 0,
          message: "Importação iniciada em segundo plano. Preparando arquivo...",
          fileName: file.name,
        });

        const result = await service.importFromBuffer(buffer, file.name, async (processed, total) => {
          await send({
            status: "running",
            progress: total ? Math.min(99, Math.round((processed / total) * 100)) : 0,
            processed,
            total,
            imported: processed,
            message: `Importando ${processed.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} CEPs na Cobertura Claro.`,
            fileName: file.name,
          });
        });

        await logAudit({
          userId: user.id,
          action: "IMPORT",
          module: "ceps",
          description: `Base Cobertura Claro importada: ${file.name}`,
          metadata: result,
        });

        await send({
          status: "completed",
          progress: 100,
          processed: result.totalRows,
          total: result.totalRows,
          imported: result.imported,
          message: `${result.imported.toLocaleString("pt-BR")} CEPs importados para Cobertura Claro com sucesso.`,
          fileName: file.name,
        });
      } catch (error) {
        await send({
          status: "failed",
          progress: 0,
          processed: 0,
          total: 0,
          imported: 0,
          message: "Não foi possível concluir a importação da Cobertura Claro.",
          error: error instanceof Error ? error.message : "Erro desconhecido",
          fileName: file.name,
        });
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      status: 202,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel iniciar a importacao da base de CEPs."), {
      status: 500,
    });
  }
}
