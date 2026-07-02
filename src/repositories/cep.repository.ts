import { prisma } from "@/lib/prisma";

export type UpsertCoverageCepInput = {
  cep: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  street?: string;
  available?: boolean;
  importedFrom?: string;
};

export class CepRepository {
  async overview() {
    const [total, available, recent, cities] = await Promise.all([
      prisma.coverageCep.count({ where: { deletedAt: null } }),
      prisma.coverageCep.count({ where: { deletedAt: null, available: true } }),
      prisma.coverageCep.findMany({
        where: { deletedAt: null },
        orderBy: { importedAt: "desc" },
        take: 8,
      }),
      prisma.coverageCep.groupBy({
        by: ["city", "state"],
        where: { deletedAt: null, city: { not: null } },
        _count: { cep: true },
        orderBy: { _count: { cep: "desc" } },
        take: 8,
      }),
    ]);

    return {
      total,
      available,
      unavailable: total - available,
      recent,
      cities: cities.map((city) => ({
        city: city.city,
        state: city.state,
        count: city._count.cep,
      })),
    };
  }

  async upsertOne(item: UpsertCoverageCepInput) {
    const now = new Date();
    const existing = await prisma.coverageCep.findFirst({ where: { cep: item.cep, deletedAt: null } });
    if (!existing) {
      return prisma.coverageCep.create({ data: {
        ...item,
        available: item.available ?? true,
        importedAt: now,
      } });
    }
    return prisma.coverageCep.update({
      where: { id: existing.id },
      data: {
        city: item.city,
        state: item.state,
        neighborhood: item.neighborhood,
        street: item.street,
        available: item.available ?? true,
        importedFrom: item.importedFrom,
        importedAt: now,
        deletedAt: null,
      }
    });
  }

  async upsertMany(items: UpsertCoverageCepInput[]) {
    const now = new Date();
    let imported = 0;

    for (const batch of chunk(items, 250)) {
      const result = await prisma.$transaction(
        batch.map((item) =>
          prisma.coverageCep.create({
            data: {
              ...item,
              available: item.available ?? true,
              importedAt: now,
            },
          }),
        ),
      );
      imported += result.length;
    }

    return imported;
  }

  async createManyPreservingRows(
    items: UpsertCoverageCepInput[],
    onProgress?: (processed: number, total: number) => void,
  ) {
    const now = new Date();
    let imported = 0;
    let processed = 0;

    await prisma.coverageCep.deleteMany({
      where: {
        importedFrom: { not: "cadastro-manual" },
      },
    });

    for (const batch of chunk(items, 5000)) {
      const result = await prisma.coverageCep.createMany({
        data: batch.map((item) => ({
          ...item,
          available: item.available ?? true,
          importedAt: now,
        })),
      });
      imported += result.count;
      processed += batch.length;
      onProgress?.(processed, items.length);
    }

    return imported;
  }

  async findByCep(cep: string) {
    return prisma.coverageCep.findFirst({
      where: { cep, available: true, deletedAt: null },
      orderBy: [{ importedAt: "desc" }, { createdAt: "desc" }],
    });
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
