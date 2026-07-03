import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { errorResponse, successResponse } from "@/lib/api-response";
import { writeTechnicalLog } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { ChatbotEngineService } from "@/modules/chatbot/services/chatbot-engine.service";
import { OpenAiService, type ExtractedCustomerData } from "@/services/openai/openai.service";

const chatbotEngineService = new ChatbotEngineService();
const openAiService = new OpenAiService();

type ZapiWebhookPayload = {
  instanceId?: string;
  phone?: string;
  sender?: string;
  from?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  messageId?: string;
  id?: string;
  callId?: string;
  notification?: string;
  body?: string;
  message?: {
    text?: string;
    body?: string;
  };
  text?: {
    message?: string;
    body?: string;
    title?: string;
    description?: string;
  };
  buttonsResponseMessage?: {
    buttonId?: string;
    message?: string;
  };
  listResponseMessage?: {
    message?: string;
    title?: string;
    selectedRowId?: string;
  };
  image?: { mimeType?: string; imageUrl?: string; caption?: string; downloadError?: string | null };
  document?: { documentUrl?: string; mimeType?: string; fileName?: string; pageCount?: number };
  audio?: { audioUrl?: string; mimeType?: string; seconds?: number; ptt?: boolean; viewOnce?: boolean };
  location?: { longitude?: number; latitude?: number; address?: string; url?: string };
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ZapiWebhookPayload;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const rateLimit = checkRateLimit(`zapi:${ip}`, 120, 60_000);

    if (!rateLimit.allowed) {
      return NextResponse.json(errorResponse("Limite de webhooks excedido.", "RATE_LIMITED"), {
        status: 429,
      });
    }

    if (payload.fromMe || payload.isGroup) {
      return NextResponse.json(successResponse("Mensagem propria ignorada.", { ignored: true }));
    }

    const phone = payload.phone ?? payload.sender ?? payload.from;
    const providerId = payload.messageId ?? payload.id;

    if (phone && isIncomingCallNotification(payload.notification)) {
      const result = await chatbotEngineService.handleIncomingCall({
        phone,
        providerId: payload.callId ?? providerId,
        rawPayload: payload as Prisma.InputJsonValue,
        instanceId: payload.instanceId,
      });
      return NextResponse.json(successResponse("Ligação recusada e fluxo retomado.", result));
    }

    const incoming = await extractIncomingMessage(payload);

    if (!phone || !incoming.message) {
      return NextResponse.json(errorResponse("Payload invalido.", "INVALID_WEBHOOK"), {
        status: 400,
      });
    }

    const result = await chatbotEngineService.processIncomingMessage({
      phone,
      message: incoming.message,
      providerId,
      rawPayload: payload as Prisma.InputJsonValue,
      instanceId: payload.instanceId,
      extractedData: incoming.extractedData,
    });

    return NextResponse.json(successResponse("Webhook processado.", result));
  } catch (error) {
    await writeTechnicalLog({
      level: "ERROR",
      category: "webhook",
      message: "Falha ao processar webhook da Z-API.",
      method: "POST",
      endpoint: "/api/webhooks/zapi",
      integration: "zapi",
      metadata: {
        error: error instanceof Error ? error.message : "unknown",
      },
    });
    return NextResponse.json(errorResponse("Nao foi possivel processar o webhook."), {
      status: 500,
    });
  }
}

function isIncomingCallNotification(notification?: string) {
  return ["CALL_RECEIVED", "CALL_VOICE", "CALL_MISSED", "CALL_MISSED_VOICE", "CALL_MISSED_VIDEO"]
    .includes(notification ?? "");
}

async function extractIncomingMessage(payload: ZapiWebhookPayload) {
  const interactiveText = [
    payload.buttonsResponseMessage?.buttonId,
    payload.buttonsResponseMessage?.message,
    payload.listResponseMessage?.selectedRowId,
    payload.listResponseMessage?.title,
    payload.listResponseMessage?.message,
  ].filter(Boolean).join(" ").trim();
  if (interactiveText) return { message: interactiveText };

  const text = (
    payload.text?.message ??
    payload.text?.body ??
    payload.text?.title ??
    payload.text?.description ??
    payload.message?.text ??
    payload.message?.body ??
    payload.body ??
    ""
  ).trim();
  if (text) return { message: text };

  if (payload.audio?.audioUrl) {
    try {
      const transcription = await openAiService.transcribeAudio({
        url: payload.audio.audioUrl,
        mimeType: payload.audio.mimeType ?? "audio/ogg",
      });
      if (transcription) return { message: transcription };
    } catch {
      // The flow below keeps the current step and asks the customer to resend.
    }
    return { message: "[Áudio não pôde ser transcrito]", extractedData: {} };
  }

  const media = payload.image?.imageUrl
    ? { url: payload.image.imageUrl, mimeType: payload.image.mimeType ?? "image/jpeg", label: "Imagem" }
    : payload.document?.documentUrl && payload.document.mimeType === "application/pdf"
      ? { url: payload.document.documentUrl, mimeType: payload.document.mimeType, label: "PDF" }
      : null;

  if (media) {
    try {
      const extractedData = await openAiService.extractCustomerData(media);
      return { message: `[${media.label} recebido]`, extractedData };
    } catch {
      return { message: `[${media.label} não pôde ser lido]`, extractedData: {} };
    }
  }

  if (payload.location && Number.isFinite(payload.location.latitude) && Number.isFinite(payload.location.longitude)) {
    const extractedData = await extractLocationData(payload.location);
    return { message: "[Localização recebida]", extractedData };
  }

  return { message: "" };
}

async function extractLocationData(location: NonNullable<ZapiWebhookPayload["location"]>): Promise<ExtractedCustomerData> {
  const addressCep = location.address?.match(/\b\d{5}-?\d{3}\b/)?.[0]?.replace(/\D/g, "");
  if (addressCep) return { cep: addressCep, address: location.address };

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": "CENTRAL-DOS-PLANOS-CRM/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return {};
    const data = await response.json() as { display_name?: string; address?: { postcode?: string } };
    return {
      cep: data.address?.postcode?.replace(/\D/g, "").slice(0, 8),
      address: data.display_name,
    };
  } catch {
    return {};
  }
}
