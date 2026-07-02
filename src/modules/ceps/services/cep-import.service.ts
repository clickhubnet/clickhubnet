import { read, utils } from "xlsx";
import { CepRepository, type UpsertCoverageCepInput } from "@/repositories/cep.repository";
import { onlyDigits } from "@/utils/mask";

export class CepImportService {
  constructor(private readonly cepRepository = new CepRepository()) {}

  async importFromBuffer(
    buffer: Buffer,
    fileName: string,
    onProgress?: (processed: number, total: number) => void,
  ) {
    const workbook = read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const ceps = rows
      .map((row): UpsertCoverageCepInput | null => {
        const normalized = normalizeRow(row);
        const cep = onlyDigits(normalized.cep ?? "").slice(0, 8);
        if (cep.length !== 8) {
          return null;
        }

        return {
          cep,
          city: normalized.city,
          state: normalized.state,
          neighborhood: normalized.neighborhood,
          street: normalized.street,
          available: normalized.available,
          importedFrom: fileName,
        };
      })
      .filter((item): item is UpsertCoverageCepInput => Boolean(item));

    const imported = await this.cepRepository.createManyPreservingRows(ceps, onProgress);

    return {
      totalRows: rows.length,
      imported,
    };
  }
}

function normalizeRow(row: Record<string, unknown>) {
  const entries = Object.entries(row).map(([key, value]) => [
    key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
    String(value ?? "").trim(),
  ]);
  const data = Object.fromEntries(entries);

  return {
    cep: data.cep ?? data.codigo_postal ?? data.codigo ?? data["codigo postal"],
    city: data.cidade ?? data.localidade ?? data.municipio ?? data.dsc_cidade,
    state: data.uf ?? data.estado ?? data.cod_uf,
    neighborhood: data.bairro,
    street: data.logradouro ?? data.rua ?? data.endereco,
    available: parseAvailability(data.disponivel ?? data.cobertura ?? data.status),
  };
}

function parseAvailability(value?: string) {
  if (!value) {
    return true;
  }
  return !["nao", "não", "false", "indisponivel", "sem cobertura"].includes(
    value.toLowerCase().trim(),
  );
}
