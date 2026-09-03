import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import {
  extractEvolutionStatusUpdates,
  isEvolutionStatusWebhook,
  isValidEvolutionWebhook,
  parseEvolutionWebhookPayload,
} from "@/services/evolution";

export async function handleEvolutionWebhook(request: Request) {
  const rawBody = await request.text();
  if (!isValidEvolutionWebhook(request, rawBody)) {
    return NextResponse.json(errorResponse("Webhook nao autorizado.", "UNAUTHORIZED"), { status: 401 });
  }

  const payload = parsePayload(rawBody);
  if (!payload) {
    return NextResponse.json(errorResponse("Payload invalido.", "INVALID_WEBHOOK"), { status: 422 });
  }

  if (isEvolutionStatusWebhook(payload)) {
    const updates = extractEvolutionStatusUpdates(payload);
    for (const update of updates) {
      await prisma.chatMessage.updateMany({
        where: { providerId: update.messageId },
        data: {
          rawPayload: {
            provider: "evolution",
            status: update.status,
            rawLastStatus: payload,
          } as Prisma.InputJsonValue,
          readAt: update.status === "lido" ? new Date() : undefined,
        },
      });
    }
    return NextResponse.json(successResponse("Status processado.", { updates: updates.length }));
  }

  const parsed = parseEvolutionWebhookPayload(payload);
  if (parsed.event === "presence") {
    await upsertConversationMemory(parsed.phone, {
      contactName: parsed.contactName || undefined,
      presenceStatus: parsed.presenceStatus,
      rawLastPresence: parsed.raw,
    });
    return NextResponse.json(successResponse("Presenca processada.", { phone: parsed.phone }));
  }

  const conversation = await findOrCreateWebhookConversation(parsed.phone, parsed.contactName);
  if (parsed.messageId) {
    const existing = await prisma.chatMessage.findFirst({ where: { providerId: parsed.messageId }, select: { id: true } });
    if (existing) {
      return NextResponse.json(successResponse("Mensagem duplicada ignorada.", { id: existing.id }));
    }
  }

  const body = parsed.message || defaultWebhookMessageLabel(parsed.kind);
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      direction: parsed.direction === "entrada" ? "inbound" : "outbound",
      body,
      providerId: parsed.messageId,
      rawPayload: {
        provider: "evolution",
        kind: parsed.kind,
        mediaUrl: parsed.mediaUrl,
        mimeType: parsed.mimeType,
        fileName: parsed.fileName,
        raw: parsed.raw,
      } as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(successResponse("Webhook processado.", { conversationId: conversation.id, messageId: message.id }));
}

export function handleEvolutionWebhookHealth() {
  return NextResponse.json(successResponse("Webhook Evolution ativo.", { ok: true }));
}

function parsePayload(rawBody: string) {
  try {
    const payload = JSON.parse(rawBody);
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function findOrCreateWebhookConversation(phone: string, contactName: string) {
  const existing = await prisma.chatConversation.findFirst({
    where: { phone, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    await upsertConversationMemory(phone, {
      contactName: contactName || undefined,
      source: "evolution",
      tags: ["evolution"],
    });
    return existing;
  }

  return prisma.chatConversation.create({
    data: {
      phone,
      state: "EVOLUTION",
      memory: {
        contactName: contactName || phone,
        assignedTo: "Equipe",
        source: "evolution",
        tags: ["evolution"],
      },
    },
  });
}

async function upsertConversationMemory(phone: string, input: Record<string, unknown>) {
  const conversation = await prisma.chatConversation.findFirst({
    where: { phone, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (!conversation) return null;

  const memory = conversation.memory && typeof conversation.memory === "object" && !Array.isArray(conversation.memory)
    ? conversation.memory as Record<string, unknown>
    : {};

  return prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { memory: { ...memory, ...input } as Prisma.InputJsonValue },
  });
}

function defaultWebhookMessageLabel(kind: string) {
  if (kind === "imagem") return "Imagem recebida";
  if (kind === "audio") return "Audio recebido";
  if (kind === "video") return "Video recebido";
  if (kind === "documento") return "Documento recebido";
  return "Mensagem recebida";
}
