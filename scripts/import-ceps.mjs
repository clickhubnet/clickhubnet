import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { read, utils } from "xlsx";

loadEnvFile(".env");

const prisma = new PrismaClient();

async function main() {
  const filePath = resolve(process.argv[2] ?? "CEPS BASE CLARO.xlsx");
  const fileName = basename(filePath);
  const buffer = readFileSync(filePath);
  const workbook = read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet, { defval: "" });

  const ceps = rows
    .map(normalizeCoverageRow)
    .filter(Boolean);

  console.log(`Linhas na planilha: ${rows.length.toLocaleString("pt-BR")}`);
  console.log(`Linhas validas com CEP: ${ceps.length.toLocaleString("pt-BR")}`);
  console.log("Limpando importacoes anteriores sem apagar cadastros manuais...");

  await prisma.coverageCep.deleteMany({
    where: {
      importedFrom: { not: "cadastro-manual" },
    },
  });

  const now = new Date();
  let imported = 0;
  for (const batch of chunk(ceps, 5000)) {
    const result = await prisma.coverageCep.createMany({
      data: batch.map((item) => ({
        ...item,
        importedFrom: fileName,
        importedAt: now,
      })),
    });
    imported += result.count;
    console.log(`Importando cobertura Claro: ${imported.toLocaleString("pt-BR")}/${ceps.length.toLocaleString("pt-BR")}`);
  }

  const totalInDb = await prisma.coverageCep.count({ where: { deletedAt: null } });
  console.log(JSON.stringify({
    totalRows: rows.length,
    validRows: ceps.length,
    imported,
    totalInDb,
    duplicatesPreserved: true,
  }, null, 2));
}

function normalizeCoverageRow(row) {
  const entries = Object.entries(row).map(([key, value]) => [
    key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
    String(value ?? "").trim(),
  ]);
  const data = Object.fromEntries(entries);
  const cep = onlyDigits(data.cep ?? data.codigo_postal ?? data.codigo ?? data["codigo postal"]).slice(0, 8);
  if (cep.length !== 8) return null;

  return {
    cep,
    city: data.cidade ?? data.localidade ?? data.municipio ?? data.dsc_cidade,
    state: data.uf ?? data.estado ?? data.cod_uf,
    neighborhood: data.bairro,
    street: data.logradouro ?? data.rua ?? data.endereco,
    available: parseAvailability(data.disponivel ?? data.cobertura ?? data.status),
  };
}

function parseAvailability(value) {
  if (!value) return true;
  return !["nao", "não", "false", "indisponivel", "sem cobertura"].includes(
    String(value).toLowerCase().trim(),
  );
}

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function loadEnvFile(path) {
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
