import { LeadRepository } from "@/repositories/lead.repository";
import type { User } from "@prisma/client";
import { createLeadSchema, updateLeadSchema } from "@/modules/leads/schemas/lead.schema";
import type { CreateLeadInput, UpdateLeadInput } from "@/modules/leads/types/lead";

export class LeadService {
  constructor(private readonly leadRepository = new LeadRepository()) {}

  async list(user?: Pick<User, "id" | "role">) {
    return this.leadRepository.findMany(user);
  }

  async get(id: string, user?: Pick<User, "id" | "role">) {
    return this.leadRepository.findById(id, user);
  }

  async create(input: CreateLeadInput) {
    const parsed = createLeadSchema.parse(input);
    return this.leadRepository.create({
      ...parsed,
      email: parsed.email || undefined,
      birthDate: parsed.birthDate || undefined,
      planId: parsed.planId || undefined,
      kanbanStageId: parsed.kanbanStageId || undefined,
      assignedUserId: parsed.assignedUserId || undefined,
      billingDueDay: parsed.billingDueDay || undefined,
    });
  }

  async update(id: string, input: UpdateLeadInput, actorUserId?: string) {
    const parsed = updateLeadSchema.parse(input);
    return this.leadRepository.update(id, {
      ...parsed,
      email: parsed.email || undefined,
      birthDate: parsed.birthDate || undefined,
      planId: parsed.planId || undefined,
      kanbanStageId: parsed.kanbanStageId || undefined,
      assignedUserId: parsed.assignedUserId || undefined,
      billingDueDay: parsed.billingDueDay || undefined,
    }, actorUserId);
  }

  async delete(id: string) {
    return this.leadRepository.softDelete(id);
  }

  async listStages() {
    return this.leadRepository.listStages();
  }

  async createStage(input: { name: string }) {
    return this.leadRepository.createStage(input);
  }

  async updateStage(id: string, input: { name: string }) {
    return this.leadRepository.updateStage(id, input);
  }

  async deleteStage(id: string) {
    return this.leadRepository.deleteStage(id);
  }
}
