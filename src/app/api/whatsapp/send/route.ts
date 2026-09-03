import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/permissions";
import { resolveEvolutionPhone, sendEvolutionAudioMessage, sendEvolutionMediaMessage, sendEvolutionTextMessage } from "@/services/evolution";
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
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => null) as SendBody | null;
    if (!body?.to || (!body.message && !body.audio && !body.media)) {
      return NextResponse.json(errorResponse("Destino e mensagem, audio ou anexo sao obrigatorios.", "VALIDATION_ERROR"), { status: 422 });
    }

    const resolvedPhone = await resolveEvolutionPhone(body.to);
    const destinationPhone = resolvedPhone.phone || normalizePhone(body.to);
    const result = body.audio
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
        : await sendEvolutionTextMessage({ to: destinationPhone, message: body.message as string });

    const providerId = resolveEvolutionMessageId(result);
    const conversation = await findOrCreateConversation({
      id: body.conversationId,
      phone: destinationPhone,
      contactName: body.contactName,
      ownerUserId: user.id,
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
          provider: "evolution",
          kind: messageKind,
          media: body.media ? { mimeType: body.mimeType, fileName: body.fileName } : undefined,
          result: normalizeJson(result),
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(successResponse("Mensagem enviada.", { result, conversationId: conversation.id }));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      errorResponse(error instanceof Error ? error.message : "Falha ao enviar pela Evolution API.", "EVOLUTION_SEND_ERROR"),
      { status: 502 },
    );
  }
}

async function findOrCreateConversation(input: { id?: string; phone: string; contactName?: string; ownerUserId: string }) {
  if (input.id) {
    const existing = await prisma.chatConversation.findFirst({ where: { id: input.id, deletedAt: null } });
    if (existing) return existing;
  }

  const existingByPhone = await prisma.chatConversation.findFirst({
    where: { phone: input.phone, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (existingByPhone) return existingByPhone;

  return prisma.chatConversation.create({
    data: {
      phone: input.phone,
      state: "MANUAL",
      ownerUserId: input.ownerUserId,
      memory: {
        contactName: input.contactName?.trim() || input.phone,
        assignedTo: "Equipe",
        source: "manual",
        tags: ["evolution", "manual"],
      },
    },
  });
}

function defaultMediaLabel(kind?: "imagem" | "video" | "documento") {
  if (kind === "imagem") return "Imagem";
  if (kind === "video") return "Video";
  if (kind === "documento") return "Documento";
  return "Mensagem";
}

function resolveEvolutionMessageId(result: unknown) {
  if (!result || typeof result !== "object") return undefined;
  const payload = result as { key?: { id?: unknown }; message?: { key?: { id?: unknown } }; messageId?: unknown; id?: unknown };
  if (typeof payload.key?.id === "string" && payload.key.id.trim()) return payload.key.id.trim();
  if (typeof payload.message?.key?.id === "string" && payload.message.key.id.trim()) return payload.message.key.id.trim();
  if (typeof payload.messageId === "string" && payload.messageId.trim()) return payload.messageId.trim();
  if (typeof payload.id === "string" && payload.id.trim()) return payload.id.trim();
  return undefined;
}

function normalizeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
