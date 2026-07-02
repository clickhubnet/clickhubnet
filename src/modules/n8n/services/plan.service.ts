import { PlanRepository } from "@/repositories/plan.repository";
import { createPlanSchema, updatePlanSchema } from "@/modules/n8n/schemas/plan.schema";
import type { CreatePlanInput, UpdatePlanInput } from "@/modules/n8n/types/plan";

export class PlanService {
  constructor(private readonly planRepository = new PlanRepository()) {}

  async list() {
    return this.planRepository.findMany();
  }

  async listActive() {
    return this.planRepository.findActive();
  }

  async create(input: CreatePlanInput) {
    const parsed = createPlanSchema.parse(input);
    return this.planRepository.create(parsed);
  }

  async update(id: string, input: UpdatePlanInput) {
    const parsed = updatePlanSchema.parse(input);
    return this.planRepository.update(id, parsed);
  }

  async delete(id: string) {
    return this.planRepository.softDelete(id);
  }
}
