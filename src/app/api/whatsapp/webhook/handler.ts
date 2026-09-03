import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { writeTechnicalLog } from "@/lib/logger";
import { ChatbotEngineService } from "@/modules/chatbot/services/chatbot-engine.service";
import {
  extractEvolutionStatusUpdates,
  isEvolutionStatusWebhook,
  isValidEvolutionWebhook,
  parseEvolutionWebhookPayload,
} from "@/services/evolution";

const chatbotEngineService = new ChatbotEngineService();

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

  if (parsed.direction === "saida") {
    return NextResponse.json(successResponse("Mensagem propria ignorada.", { ignored: true }));
  }

  const body = parsed.message || defaultWebhookMessageLabel(parsed.kind);
  try {
    const result = await chatbotEngineService.processIncomingMessage({
      phone: parsed.phone,
      message: body,
      providerId: parsed.messageId,
      rawPayload: {
        provider: "evolution",
        kind: parsed.kind,
        mediaUrl: parsed.mediaUrl,
        mimeType: parsed.mimeType,
        fileName: parsed.fileName,
        raw: parsed.raw,
      } as Prisma.InputJsonValue,
      instanceId: process.env.EVOLUTION_INSTANCE,
      provider: "evolution",
    });

    return NextResponse.json(successResponse("Webhook processado.", result));
  } catch (error) {
    await writeTechnicalLog({
      level: "ERROR",
      category: "webhook",
      message: "Falha ao processar fluxo da Evolution API.",
      method: "POST",
      endpoint: "/api/whatsapp/webhook",
      integration: "evolution",
      metadata: { error: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json(errorResponse("Nao foi possivel processar o fluxo da Evolution."), { status: 500 });
  }
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
