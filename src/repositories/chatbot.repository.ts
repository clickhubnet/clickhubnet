import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class ChatbotRepository {
  async findMessageByProviderId(providerId: string) {
    return prisma.chatMessage.findFirst({
      where: { providerId },
      select: { id: true, conversationId: true, createdAt: true },
    });
  }

  async hasOutboundResponseAfter(conversationId: string, receivedAt: Date) {
    const response = await prisma.chatMessage.findFirst({
      where: {
        conversationId,
        direction: "outbound",
        createdAt: { gte: receivedAt },
      },
      select: { id: true },
    });

    return Boolean(response);
  }

  async findOrCreateConversation(phone: string, agentId?: string) {
    const existing = await prisma.chatConversation.findFirst({
      where: { phone, agentId: agentId ?? undefined, deletedAt: null },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } },
    });

    if (existing) {
      return existing;
    }

    return prisma.chatConversation.create({
      data: { phone, agentId, state: "START", memory: {} },
      include: { messages: true },
    });
  }

  async saveMessage(input: {
    conversationId: string;
    direction: "inbound" | "outbound";
    body: string;
    providerId?: string;
    rawPayload?: Prisma.InputJsonValue;
  }) {
    const message = await prisma.chatMessage.create({
      data: input,
    });
    await prisma.chatConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });
    return message;
  }

  async findConversationById(id: string) {
    return prisma.chatConversation.findFirst({
      where: { id, deletedAt: null },
      include: {
        lead: true,
        agent: true,
        owner: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async findConversationByPhone(phone: string) {
    return prisma.chatConversation.findFirst({
      where: { phone, deletedAt: null },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createManualConversation(input: {
    phone: string;
    name?: string;
    assignedTo?: string;
    ownerUserId?: string;
  }) {
    return prisma.chatConversation.create({
      data: {
        phone: input.phone,
        state: "MANUAL",
        ownerUserId: input.ownerUserId,
        memory: {
          contactName: input.name?.trim() || input.phone,
          assignedTo: input.assignedTo?.trim() || "Equipe",
          tags: [],
        },
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async updateManualConversation(input: {
    id: string;
    name?: string;
    assignedTo?: string;
    tags?: unknown;
    state?: string;
    blocked?: boolean;
  }) {
    const current = await prisma.chatConversation.findUnique({ where: { id: input.id } });
    const memory = normalizeJsonObject(current?.memory);
    const previousState = typeof memory.previousState === "string" ? memory.previousState : undefined;
    const nextState = input.blocked === true
      ? "BLOCKED"
      : input.blocked === false
        ? previousState ?? "MANUAL"
        : input.state ?? current?.state;
    return prisma.chatConversation.update({
      where: { id: input.id },
      data: {
        state: nextState,
        memory: normalizeJsonValue({
          ...memory,
          contactName: input.name ?? memory.contactName,
          assignedTo: input.assignedTo ?? memory.assignedTo,
          tags: input.tags ?? memory.tags,
          blocked: input.blocked ?? memory.blocked,
          previousState: input.blocked === true ? (previousState ?? current?.state ?? "MANUAL") : previousState,
        }),
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  async softDeleteConversation(id: string) {
    return prisma.chatConversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async claimInboundMessage(input: {
    conversationId: string;
    body: string;
    providerId: string;
    rawPayload?: Prisma.InputJsonValue;
  }) {
    try {
      await prisma.chatMessage.create({
        data: {
          ...input,
          direction: "inbound",
        },
      });
      await prisma.chatConversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return false;
      }
      throw error;
    }
  }

  async updateConversation(input: {
    id: string;
    state: string;
    memory: Prisma.InputJsonValue;
    leadId?: string;
  }) {
    return prisma.chatConversation.update({
      where: { id: input.id },
      data: {
        state: input.state,
        memory: input.memory,
        leadId: input.leadId,
      },
    });
  }

  async createLeadFromChat(input: {
    name: string;
    phone: string;
    email?: string;
    cpfCnpj?: string;
    birthDate?: Date;
    cep?: string;
    address?: string;
    streetNumber?: string;
    complement?: string;
    city?: string;
    state?: string;
    neighborhood?: string;
    billingDueDay?: number;
    planId?: string;
    planName?: string;
    expectedValue?: number;
    notes?: string;
  }) {
    const existing = await prisma.lead.findFirst({
      where: { phone: input.phone, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const data = {
      name: input.name,
      phone: input.phone,
      email: input.email,
      cpfCnpj: input.cpfCnpj,
      birthDate: input.birthDate,
      cep: input.cep,
      address: input.address,
      streetNumber: input.streetNumber,
      complement: input.complement,
      city: input.city,
      state: input.state,
      neighborhood: input.neighborhood,
      billingDueDay: input.billingDueDay,
      planId: input.planId,
      planName: input.planName,
      planValue: input.expectedValue,
      expectedValue: input.expectedValue,
      source: "chatbot",
      notes: input.notes,
    };

    if (existing) {
      return prisma.lead.update({
        where: { id: existing.id },
        data: {
          ...data,
          status: existing.status === "LOST" ? "NEW" : existing.status,
        },
      });
    }

    return prisma.lead.create({
      data: {
        ...data,
        cep: input.cep,
      },
    });
  }

  async getDefaultAgent() {
    return prisma.agent.findFirst({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  async getAgentByInstance(instanceId?: string) {
    if (instanceId) {
      const agent = await prisma.agent.findFirst({
        where: { zapiInstanceId: instanceId, active: true, deletedAt: null },
        include: { plans: { where: { active: true, deletedAt: null }, orderBy: [{ order: "asc" }, { price: "asc" }] } },
      });
      if (agent) return agent;
    }
    return prisma.agent.findFirst({
      where: { active: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: { plans: { where: { active: true, deletedAt: null }, orderBy: [{ order: "asc" }, { price: "asc" }] } },
    });
  }

  async listActivePlans(agentId?: string) {
    return prisma.plan.findMany({
      where: { active: true, deletedAt: null, agents: agentId ? { some: { id: agentId } } : undefined },
      orderBy: [{ order: "asc" }, { price: "asc" }],
    });
  }

  async listConversations() {
    return prisma.chatConversation.findMany({
      where: { deletedAt: null },
      include: {
        lead: true,
        agent: true,
        owner: true,
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
  }
}

function normalizeJsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
