import { randomUUID } from "node:crypto";
import { logAudit } from "@/lib/audit";
import { CepImportService } from "@/modules/ceps/services/cep-import.service";

export type CepImportJobStatus = "queued" | "running" | "completed" | "failed";

export type CepImportJob = {
  id: string;
  fileName: string;
  status: CepImportJobStatus;
  processed: number;
  total: number;
  imported: number;
  progress: number;
  message: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

const globalForCepImportJobs = globalThis as typeof globalThis & {
  cepImportJobs?: Map<string, CepImportJob>;
};

const jobs = globalForCepImportJobs.cepImportJobs ?? new Map<string, CepImportJob>();
globalForCepImportJobs.cepImportJobs = jobs;

export function startCepImportJob(input: { buffer: Buffer; fileName: string; userId: string }) {
  const id = randomUUID();
  const job: CepImportJob = {
    id,
    fileName: input.fileName,
    status: "queued",
    processed: 0,
    total: 0,
    imported: 0,
    progress: 0,
    message: "Importação aguardando início.",
    startedAt: new Date().toISOString(),
  };

  jobs.set(id, job);

  void runCepImportJob({ ...input, id });

  return job;
}

export function getCepImportJob(id: string) {
  return jobs.get(id) ?? null;
}

async function runCepImportJob(input: { id: string; buffer: Buffer; fileName: string; userId: string }) {
  const job = jobs.get(input.id);
  if (!job) return;

  try {
    job.status = "running";
    job.message = "Importação em andamento.";

    const service = new CepImportService();
    const result = await service.importFromBuffer(input.buffer, input.fileName, (processed, total) => {
      job.processed = processed;
      job.total = total;
      job.progress = total ? Math.min(99, Math.round((processed / total) * 100)) : 0;
      job.message = `Importando ${processed.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} CEPs.`;
    });

    job.status = "completed";
    job.processed = result.totalRows;
    job.total = result.totalRows;
    job.imported = result.imported;
    job.progress = 100;
    job.message = `${result.imported.toLocaleString("pt-BR")} CEPs importados com sucesso.`;
    job.finishedAt = new Date().toISOString();

    await logAudit({
      userId: input.userId,
      action: "IMPORT",
      module: "ceps",
      description: `Base Cobertura Claro importada: ${input.fileName}`,
      metadata: result,
    });
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : "Erro desconhecido";
    job.message = "Não foi possível concluir a importação.";
    job.finishedAt = new Date().toISOString();
  }
}
