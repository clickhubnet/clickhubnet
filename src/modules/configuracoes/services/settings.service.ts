import type { Prisma } from "@prisma/client";
import { SettingsRepository } from "@/repositories/settings.repository";

export class SettingsService {
  constructor(private readonly settingsRepository = new SettingsRepository()) {}

  async list() {
    return this.settingsRepository.findMany();
  }

  async update(input: Record<string, Prisma.InputJsonValue>) {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    const results = [];

    for (const [key, value] of entries) {
      results.push(await this.settingsRepository.upsert(key, value));
    }

    return results;
  }
}
