import { AgentRepository } from "@/repositories/agent.repository";
import { createAgentSchema, updateAgentSchema } from "@/modules/n8n/schemas/agent.schema";
import type { CreateAgentInput, UpdateAgentInput } from "@/modules/n8n/types/agent";

export class AgentService {
  constructor(private readonly agentRepository = new AgentRepository()) {}

  async list() {
    return this.agentRepository.findMany();
  }

  async create(input: CreateAgentInput) {
    const parsed = createAgentSchema.parse(input);
    if (
      parsed.minTypingSeconds !== undefined &&
      parsed.maxTypingSeconds !== undefined &&
      parsed.minTypingSeconds > parsed.maxTypingSeconds
    ) {
      throw new Error("O tempo minimo nao pode ser maior que o maximo.");
    }
    return this.agentRepository.create(parsed as CreateAgentInput);
  }

  async update(id: string, input: UpdateAgentInput) {
    const parsed = updateAgentSchema.parse(input);
    return this.agentRepository.update(id, parsed as UpdateAgentInput);
  }

  async delete(id: string) {
    return this.agentRepository.softDelete(id);
  }
}
