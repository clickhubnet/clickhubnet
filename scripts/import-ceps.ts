import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { prisma } from "@/lib/prisma";
import { CepImportService } from "@/modules/ceps/services/cep-import.service";

async function main() {
  const filePath = resolve(process.argv[2] ?? "CEPS BASE CLARO.xlsx");
  const buffer = await readFile(filePath);
  const service = new CepImportService();

  const result = await service.importFromBuffer(buffer, basename(filePath), (processed, total) => {
    console.log(`Importando cobertura Claro: ${processed}/${total}`);
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
