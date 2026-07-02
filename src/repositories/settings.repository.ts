import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class SettingsRepository {
  async findMany() {
    return prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  }

  async upsert(key: string, value: Prisma.InputJsonValue) {
    return prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
