import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/permissions";
import { resolveEvolutionPhone, sendEvolutionAudioMessage, sendEvolutionMediaMessage, sendEvolutionTextMessage } from "@/services/evolution";
import { checkMetaWhatsAppNumber, isMetaWhatsAppEnabled, sendMetaMediaMessage, sendMetaTextMessage } from "@/services/meta-whatsapp";
import { normalizePhone } from "@/services/validators";

type SendBody = {
  to?: string;
  message?: string;
  audio?: string;
  media?: string;
  kind?: "imagem" | "video" | "documento";
  mimeType?: string;
  fileName?: string;
  conversationId?: string;
  contactName?: string;
  tags?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => null) as SendBody | null;
    if (!body?.to || (!body.message && !body.audio && !body.media)) {
      return NextResponse.json(errorResponse("Destino e mensagem, audio ou anexo sao obrigatorios.", "VALIDATION_ERROR"), { status: 422 });
    }

    const usingMeta = isMetaWhatsAppEnabled();
    if (usingMeta && body.audio) {
      return NextResponse.json(errorResponse("Envio manual de audio pela Meta ainda nao esta habilitado.", "VALIDATION_ERROR"), { status: 422 });
    }
    const resolvedPhone = usingMeta ? await checkMetaWhatsAppNumber(body.to) : await resolveEvolutionPhone(body.to);
    const destinationPhone = resolvedPhone.phone || normalizePhone(body.to);
    const result = usingMeta
      ? body.media && body.kind
        ? await sendMetaMediaMessage({
            to: destinationPhone,
            media: body.media,
            kind: body.kind,
            caption: body.message,
            fileName: body.fileName,
            mimeType: body.mimeType,
          })
        : await sendMetaTextMessage({ to: destinationPhone, message: body.message as string })
      : body.audio
      ? await sendEvolutionAudioMessage({ to: destinationPhone, audio: body.audio, mimeType: body.mimeType })
      : body.media && body.kind
        ? await sendEvolutionMediaMessage({
            to: destinationPhone,
            media: body.media,
            kind: body.kind,
            caption: body.message,
            fileName: body.fileName,
            mimeType: body.mimeType,
          })
        : await sendEvolutionTextMessage({ to: destinationPhone, message: body.message as string, delayTypingSeconds: 2 });

    const providerId = resolveWhatsAppMessageId(result);
    const conversation = await findOrCreateConversation({
      id: body.conversationId,
      phone: destinationPhone,
      contactName: body.contactName,
      ownerUserId: user.id,
      tags: body.tags,
    });

    const messageKind = body.audio ? "audio" : body.media ? body.kind : "texto";
    const content = body.audio ? "Audio" : body.message || defaultMediaLabel(body.kind);
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        body: content,
        providerId,
        sentAt: new Date(),
        rawPayload: {
          provider: usingMeta ? "meta" : "evolution",
          kind: messageKind,
          media: body.media ? { source: body.media, kind: body.kind, mimeType: body.mimeType, fileName: body.fileName } : undefined,
          result: normalizeJson(result),
        } as Prisma.InputJsonValue,
      },
    });
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(successResponse("Mensagem enviada.", { result, conversationId: conversation.id }));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      errorResponse(error instanceof Error ? error.message : "Falha ao enviar pelo WhatsApp.", "WHATSAPP_SEND_ERROR"),
      { status: 502 },
    );
  }
}

async function findOrCreateConversation(input: { id?: string; phone: string; contactName?: string; ownerUserId: string; tags?: unknown }) {
  const tags = normalizeTags(input.tags);
  if (input.id) {
    const existing = await prisma.chatConversation.findFirst({ where: { id: input.id, deletedAt: null } });
    if (existing) return mergeConversationTags(existing, tags);
  }

  const existingByPhone = await prisma.chatConversation.findFirst({
    where: { phone: input.phone, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (existingByPhone) return mergeConversationTags(existingByPhone, tags);

  return prisma.chatConversation.create({
    data: {
      phone: input.phone,
      state: "MANUAL",
      ownerUserId: input.ownerUserId,
      memory: {
        contactName: input.contactName?.trim() || input.phone,
        assignedTo: "Equipe",
        tags,
      },
    },
  });
}

async function mergeConversationTags<T extends { id: string; memory: Prisma.JsonValue }>(conversation: T, tags: string[]) {
  if (!tags.length) return conversation;
  const memory = normalizeJsonObject(conversation.memory);
  const currentTags = Array.isArray(memory.tags) ? memory.tags.map((tag) => String(tag)) : [];
  const mergedTags = normalizeTags([...currentTags, ...tags]);
  return prisma.chatConversation.update({
    where: { id: conversation.id },
    data: { memory: normalizeJsonValue({ ...memory, tags: mergedTags }) },
  });
}

function normalizeTags(value: unknown) {
  const tags = Array.isArray(value)
    ? value.map((tag) => String(tag))
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function defaultMediaLabel(kind?: "imagem" | "video" | "documento") {
  if (kind === "imagem") return "Imagem";
  if (kind === "video") return "Video";
  if (kind === "documento") return "Documento";
  return "Mensagem";
}

function resolveWhatsAppMessageId(result: unknown) {
  if (!result || typeof result !== "object") return undefined;
  const payload = result as { key?: { id?: unknown }; message?: { key?: { id?: unknown } }; messages?: Array<{ id?: unknown }>; messageId?: unknown; id?: unknown };
  if (typeof payload.messages?.[0]?.id === "string" && payload.messages[0].id.trim()) return payload.messages[0].id.trim();
  if (typeof payload.key?.id === "string" && payload.key.id.trim()) return payload.key.id.trim();
  if (typeof payload.message?.key?.id === "string" && payload.message.key.id.trim()) return payload.message.key.id.trim();
  if (typeof payload.messageId === "string" && payload.messageId.trim()) return payload.messageId.trim();
  if (typeof payload.id === "string" && payload.id.trim()) return payload.id.trim();
  return undefined;
}

function normalizeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
