import "server-only";

import { Buffer } from "node:buffer";
import type { Prisma } from "@prisma/client";
import { writeTechnicalLog } from "@/lib/logger";
import { isValidBrazilianWhatsApp, normalizePhone as normalizeBrazilianPhone } from "@/services/validators";

type SendEvolutionTextInput = {
  to: string;
  message: string;
  delayTypingSeconds?: number;
};

type SendEvolutionAudioInput = {
  to: string;
  audio: string;
  mimeType?: string;
};

type SendEvolutionMediaInput = {
  to: string;
  media: string;
  kind: "imagem" | "video" | "documento";
  caption?: string;
  fileName?: string;
  mimeType?: string;
};

type CheckEvolutionWhatsAppResult = {
  exists: boolean;
  phone: string;
  jid?: string;
  raw: unknown;
};

export type ParsedEvolutionWebhook =
  | {
      event: "presence";
      phone: string;
      contactName: string;
      presenceStatus: "available" | "unavailable" | "composing" | "paused" | "recording";
      raw: Record<string, unknown>;
    }
  | {
      event: "message";
      phone: string;
      contactName: string;
      kind: "texto" | "imagem" | "audio" | "video" | "documento";
      message: string;
      mediaUrl?: string;
      mimeType?: string;
      fileName?: string;
      messageId: string;
      direction: "entrada" | "saida";
      raw: Record<string, unknown>;
    };

function normalizePhone(value: string) {
  return normalizeBrazilianPhone(value);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function resolveTypingDelay(delayTypingSeconds?: number) {
  if (!delayTypingSeconds) return 0;
  return Math.min(15_000, Math.max(1_000, Math.round(delayTypingSeconds * 1000)));
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

export function getEvolutionConfig() {
  const baseUrl = trimTrailingSlash(process.env.EVOLUTION_API_URL?.trim() || "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim() || "";
  const instanceName = process.env.EVOLUTION_INSTANCE?.trim() || "";
  const instanceToken = process.env.EVOLUTION_INSTANCE_TOKEN?.trim() || "";
  const defaultNumber = process.env.EVOLUTION_DEFAULT_NUMBER?.trim() || "";
  const encodedInstanceName = encodeURIComponent(instanceName);

  if (!baseUrl || !apiKey || !instanceName) {
    throw new Error("Credenciais da Evolution API nao configuradas no backend.");
  }

  return {
    baseUrl,
    apiKey,
    instanceName,
    instanceToken,
    defaultNumber,
    sendTextUrl: `${baseUrl}/message/sendText/${encodedInstanceName}`,
    sendAudioUrl: `${baseUrl}/message/sendWhatsAppAudio/${encodedInstanceName}`,
    sendMediaUrl: `${baseUrl}/message/sendMedia/${encodedInstanceName}`,
    markReadUrl: `${baseUrl}/message/markread`,
    chatPresenceUrl: `${baseUrl}/message/presence`,
  };
}

export async function resolveEvolutionPhone(input: string) {
  const normalizedInput = normalizePhone(input);
  return {
    inputPhone: input,
    phone: normalizedInput,
    exists: Boolean(normalizedInput),
  };
}

export async function checkEvolutionWhatsAppNumber(input: string): Promise<CheckEvolutionWhatsAppResult> {
  const config = getEvolutionConfig();
  const normalizedInput = normalizePhone(input);
  const endpoint = `${config.baseUrl}/chat/whatsappNumbers/${encodeURIComponent(config.instanceName)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey,
    },
    body: JSON.stringify({ numbers: [normalizedInput] }),
    cache: "no-store",
  });

  const result = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(formatEvolutionError(result, "A Evolution API recusou a validacao do numero."));
  }

  return parseWhatsappNumberCheck(result, normalizedInput);
}

export async function sendEvolutionTextMessage(input: SendEvolutionTextInput) {
  const config = getEvolutionConfig();
  const delay = resolveTypingDelay(input.delayTypingSeconds);
  const response = await fetch(config.sendTextUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.apiKey,
    },
    body: JSON.stringify({
      number: normalizePhone(input.to),
      text: input.message,
      textMessage: {
        text: input.message,
      },
      ...(delay
        ? {
            delay,
            options: {
              delay,
              presence: "composing",
            },
          }
        : {}),
    }),
    cache: "no-store",
  });

  const result = await parseApiResponse(response);
  if (!response.ok) {
    throw new Error(formatEvolutionError(result, "A Evolution API recusou o envio."));
  }

  return result;
}

export async function markEvolutionMessageAsRead(input: { phone: string; messageId: string }) {
  const config = getEvolutionConfig();
  try {
    const response = await fetch(config.markReadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number: normalizePhone(input.phone),
        id: [input.messageId],
      }),
      cache: "no-store",
    });

    if (response.ok) return true;
    const result = await parseApiResponse(response);
    await writeTechnicalLog({
      level: "ERROR",
      category: "integration",
      message: "Evolution API recusou marcar mensagem como lida.",
      method: "POST",
      endpoint: "/message/markread",
      statusCode: response.status,
      integration: "evolution",
      metadata: { response: normalizeJsonForLog(result) },
    });
  } catch (error) {
    await writeTechnicalLog({
      level: "ERROR",
      category: "integration",
      message: "Falha ao marcar mensagem como lida na Evolution API.",
      method: "POST",
      endpoint: "/message/markread",
      integration: "evolution",
      metadata: { error: error instanceof Error ? error.message : "unknown" },
    });
  }
  return false;
}

export async function setEvolutionChatPresence(input: {
  phone: string;
  state: "composing" | "paused" | "recording" | "available" | "unavailable";
  isAudio?: boolean;
}) {
  const config = getEvolutionConfig();
  try {
    const response = await fetch(config.chatPresenceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey,
      },
      body: JSON.stringify({
        number: normalizePhone(input.phone),
        state: input.state,
        isAudio: input.isAudio ?? false,
      }),
      cache: "no-store",
    });

    if (response.ok) return true;
    const result = await parseApiResponse(response);
    await writeTechnicalLog({
      level: "ERROR",
      category: "integration",
      message: "Evolution API recusou atualizar presenca no chat.",
      method: "POST",
      endpoint: "/message/presence",
      statusCode: response.status,
      integration: "evolution",
      metadata: { response: normalizeJsonForLog(result) },
    });
  } catch (error) {
    await writeTechnicalLog({
      level: "ERROR",
      category: "integration",
      message: "Falha ao atualizar presenca no chat pela Evolution API.",
      method: "POST",
      endpoint: "/message/presence",
      integration: "evolution",
      metadata: { error: error instanceof Error ? error.message : "unknown" },
    });
  }
  return false;
}

export async function sendEvolutionAudioMessage(input: SendEvolutionAudioInput) {
  const config = getEvolutionConfig();
  const normalizedAudio = normalizeOwnedMedia(input.audio);
  const mimeType = input.mimeType?.trim() || "audio/webm";
  const fileName = resolveAudioFileName(mimeType);
  const primaryPayload = {
    number: normalizePhone(input.to),
    mediatype: "audio",
    media: normalizedAudio,
    fileName,
    mimetype: mimeType,
  };

  const primary = await postEvolutionJson(config.sendMediaUrl, config.apiKey, primaryPayload);
  if (primary.ok) return primary.result;

  const form = new FormData();
  form.set("number", normalizePhone(input.to));
  form.set("mediatype", "audio");
  form.set("fileName", fileName);
  const mediaValue = createOwnedMediaFormValue(normalizedAudio, mimeType, fileName);
  if (mediaValue.kind === "url") {
    form.set("media", mediaValue.value);
  } else {
    form.set("media", mediaValue.value, mediaValue.fileName);
  }

  const fallback = await postEvolutionForm(config.sendMediaUrl, config.apiKey, form);
  if (fallback.ok) return fallback.result;

  throw new Error(formatEvolutionError(fallback.result ?? primary.result, "A Evolution API recusou o envio do audio."));
}

export async function sendEvolutionMediaMessage(input: SendEvolutionMediaInput) {
  const config = getEvolutionConfig();
  const normalizedMedia = normalizeOwnedMedia(input.media);
  const mediaFileName = resolveUploadFileName(input);
  const primaryPayload = {
    number: normalizePhone(input.to),
    mediatype: input.kind === "imagem" ? "image" : input.kind === "video" ? "video" : "document",
    media: normalizedMedia,
    fileName: mediaFileName,
    caption: input.caption?.trim() || undefined,
    mimetype: input.mimeType?.trim() || undefined,
  };

  const primary = await postEvolutionJson(config.sendMediaUrl, config.apiKey, primaryPayload);
  if (primary.ok) return primary.result;

  const form = new FormData();
  form.set("number", normalizePhone(input.to));
  if (input.caption?.trim()) form.set("caption", input.caption.trim());
  if (mediaFileName) form.set("fileName", mediaFileName);
  const mediaValue = createOwnedMediaFormValue(normalizedMedia, input.mimeType, mediaFileName);
  if (mediaValue.kind === "url") {
    form.set("media", mediaValue.value);
  } else {
    form.set("media", mediaValue.value, mediaValue.fileName);
  }

  const fallback = await postEvolutionForm(config.sendMediaUrl, config.apiKey, form);
  if (fallback.ok) return fallback.result;

  throw new Error(formatEvolutionError(fallback.result ?? primary.result, `A Evolution API recusou o envio de ${input.kind}.`));
}

async function postEvolutionJson(url: string, apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const result = await parseApiResponse(response);
  return { ok: response.ok, result };
}

async function postEvolutionForm(url: string, apiKey: string, form: FormData) {
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: apiKey },
    body: form,
    cache: "no-store",
  });

  const result = await parseApiResponse(response);
  return { ok: response.ok, result };
}

function normalizeOwnedMedia(value: string) {
  const normalized = value.trim();
  const dataUrlMatch = normalized.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) return dataUrlMatch[2];
  return normalized;
}

function createOwnedMediaFormValue(media: string, mimeType?: string, fileName?: string) {
  if (/^https?:\/\//i.test(media)) {
    return { kind: "url" as const, value: media };
  }

  const contentType = mimeType?.trim() || "application/octet-stream";
  const bytes = Buffer.from(media, "base64");
  const blob = new Blob([bytes], { type: contentType });
  return { kind: "blob" as const, value: blob, fileName };
}

function resolveUploadFileName(input: SendEvolutionMediaInput) {
  if (input.fileName?.trim()) return input.fileName.trim();
  if (input.kind === "imagem") return "imagem";
  if (input.kind === "video") return "video";
  return "documento";
}

function resolveAudioFileName(mimeType: string) {
  if (mimeType.includes("ogg")) return "gravacao.ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "gravacao.mp3";
  if (mimeType.includes("wav")) return "gravacao.wav";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "gravacao.m4a";
  return "gravacao.webm";
}

function formatEvolutionError(result: unknown, fallbackMessage: string) {
  if (typeof result === "object" && result) return JSON.stringify(result);
  return fallbackMessage;
}

function normalizeJsonForLog(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function parseWhatsappNumberCheck(result: unknown, fallbackPhone: string): CheckEvolutionWhatsAppResult {
  const candidates = Array.isArray(result)
    ? result
    : result && typeof result === "object"
      ? [
          ...(Array.isArray((result as { data?: unknown }).data) ? (result as { data: unknown[] }).data : []),
          ...(Array.isArray((result as { numbers?: unknown }).numbers) ? (result as { numbers: unknown[] }).numbers : []),
          ...(Array.isArray((result as { response?: unknown }).response) ? (result as { response: unknown[] }).response : []),
          result,
        ]
      : [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const exists = Boolean(entry.exists ?? entry.exist ?? entry.onWhatsapp ?? entry.isWhatsapp);
    const jid = firstDefinedString([entry.jid, entry.remoteJid, entry.remoteJidAlt]);
    const phone = normalizePhone(firstDefinedString([entry.number, entry.phone, jid]) || fallbackPhone);
    if (phone || jid) return { exists, phone: phone || fallbackPhone, jid: jid || undefined, raw: result };
  }

  return { exists: false, phone: fallbackPhone, raw: result };
}

export function isValidEvolutionWebhook(request: Request, body: string) {
  const expectedTokens = [
    process.env.EVOLUTION_WEBHOOK_SECRET?.trim(),
    process.env.EVOLUTION_API_KEY?.trim(),
    process.env.EVOLUTION_INSTANCE_TOKEN?.trim(),
  ].filter((value): value is string => Boolean(value));
  if (!expectedTokens.length) return true;

  const authHeader = request.headers.get("authorization");
  const authToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
  let payloadApiKey = "";
  try {
    const parsed = JSON.parse(body) as { apikey?: unknown };
    payloadApiKey = typeof parsed.apikey === "string" ? parsed.apikey.trim() : "";
  } catch {
    payloadApiKey = "";
  }

  const candidates = [
    request.headers.get("apikey"),
    request.headers.get("apiKey"),
    request.headers.get("x-api-key"),
    authToken,
    new URL(request.url).searchParams.get("token"),
    payloadApiKey,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (!candidates.length) return body.length > 0;
  return candidates.some((candidate) => expectedTokens.includes(candidate));
}

export function parseEvolutionWebhookPayload(payload: Record<string, unknown>) {
  const event = String(payload.event ?? "").toLowerCase();
  const data = payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : payload;
  const key = data.key && typeof data.key === "object" ? (data.key as Record<string, unknown>) : {};
  const phone = resolveWebhookPhone(payload, data, key);
  const contactName = normalizeTextCandidate(
    data.pushName ?? data.notifyName ?? data.senderName ?? payload.senderName ?? payload.pushName,
  );

  if (event.includes("presence")) {
    return {
      event: "presence",
      phone,
      contactName,
      presenceStatus: extractPresenceStatus(payload, data),
      raw: payload,
    } satisfies ParsedEvolutionWebhook;
  }

  const kind = resolveMessageKind(data);
  const media = extractMediaData(data, kind);
  return {
    event: "message",
    phone,
    contactName,
    kind,
    message: extractMessageText(data),
    mediaUrl: media.mediaUrl,
    mimeType: media.mimeType,
    fileName: media.fileName,
    messageId: String(key.id ?? data.id ?? `${phone}-${Date.now()}`),
    direction: key.fromMe === true || data.fromMe === true ? "saida" : "entrada",
    raw: payload,
  } satisfies ParsedEvolutionWebhook;
}

export function isEvolutionStatusWebhook(payload: Record<string, unknown>) {
  return String(payload.event ?? "").toLowerCase() === "messages.update";
}

export function extractEvolutionStatusUpdates(payload: Record<string, unknown>) {
  const data = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];

  return data.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const key = item.key && typeof item.key === "object" ? (item.key as Record<string, unknown>) : {};
    const update = item.update && typeof item.update === "object" ? (item.update as Record<string, unknown>) : item;
    const messageId = firstString([key.id, item.id, update.id]);
    if (!messageId) return [];

    return [{
      messageId,
      status: mapEvolutionMessageStatus(update.status ?? update.statusMessage ?? update.messageStatus),
    }];
  });
}

function resolveWebhookPhone(payload: Record<string, unknown>, data: Record<string, unknown>, key: Record<string, unknown>) {
  const candidates = [
    key.remoteJid,
    key.remoteJidAlt,
    data.remoteJid,
    payload.key && typeof payload.key === "object" ? (payload.key as Record<string, unknown>).remoteJid : undefined,
    key.participant,
    data.participant,
    payload.phone,
    data.phone,
    payload.sender,
    data.sender,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const normalized = normalizeBrazilianPhone(candidate);
    if (isValidBrazilianWhatsApp(normalized)) return normalized;

    const digits = candidate.replace(/\D/g, "");
    for (const size of [13, 12, 11, 10]) {
      if (digits.length < size) continue;
      const sliced = digits.slice(-size);
      const normalizedSlice = normalizeBrazilianPhone(sliced);
      if (isValidBrazilianWhatsApp(normalizedSlice)) return normalizedSlice;
    }
  }

  const fallback = String(payload.sender ?? data.sender ?? key.remoteJid ?? data.remoteJid ?? payload.phone ?? "");
  return fallback.replace(/@.+$/, "").replace(/\D/g, "");
}

function extractPresenceStatus(payload: Record<string, unknown>, data: Record<string, unknown>) {
  const status = String(data.lastKnownPresence ?? data.status ?? payload.status ?? "").toUpperCase();
  if (status === "AVAILABLE") return "available";
  if (status === "UNAVAILABLE") return "unavailable";
  if (status === "COMPOSING") return "composing";
  if (status === "RECORDING") return "recording";
  return "paused";
}

function resolveMessageKind(data: Record<string, unknown>): "texto" | "imagem" | "audio" | "video" | "documento" {
  const messageType = String(data.messageType ?? "").toLowerCase();
  const message = data.message && typeof data.message === "object" ? (data.message as Record<string, unknown>) : {};
  if (message.imageMessage || messageType.includes("image")) return "imagem";
  if (message.audioMessage || messageType.includes("audio") || messageType.includes("ptt")) return "audio";
  if (message.videoMessage || messageType.includes("video")) return "video";
  if (message.documentMessage || messageType.includes("document")) return "documento";
  return "texto";
}

function extractMessageText(data: Record<string, unknown>) {
  const message = data.message && typeof data.message === "object" ? (data.message as Record<string, unknown>) : {};
  const candidates: unknown[] = [
    data.text,
    data.body,
    data.caption,
    message.conversation,
    (message.extendedTextMessage as { text?: unknown } | undefined)?.text,
    (message.imageMessage as { caption?: unknown } | undefined)?.caption,
    (message.videoMessage as { caption?: unknown } | undefined)?.caption,
    (message.documentMessage as { caption?: unknown } | undefined)?.caption,
    (message.buttonsResponseMessage as { selectedDisplayText?: unknown } | undefined)?.selectedDisplayText,
    (message.listResponseMessage as { title?: unknown; description?: unknown } | undefined)?.title,
    (message.listResponseMessage as { title?: unknown; description?: unknown } | undefined)?.description,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeTextCandidate(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function extractMediaData(data: Record<string, unknown>, kind: string) {
  const message = data.message && typeof data.message === "object" ? (data.message as Record<string, unknown>) : {};
  const nestedPayloads = [message.imageMessage, message.audioMessage, message.videoMessage, message.documentMessage, data]
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");

  const mediaUrl = firstString(
    nestedPayloads.flatMap((item) => [item.url, item.mediaUrl, item.imageUrl, item.audioUrl, item.videoUrl, item.documentUrl, item.directPath, item.base64, item.data]),
  );
  const mimeType = firstString(nestedPayloads.flatMap((item) => [item.mimetype, item.mimeType]));
  const fileName = firstString(nestedPayloads.flatMap((item) => [item.fileName, item.filename, item.title, kind === "audio" ? "audio.ogg" : ""]));
  return { mediaUrl, mimeType, fileName };
}

function mapEvolutionMessageStatus(value: unknown): "enviado" | "entregue" | "lido" | "falha" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (["READ", "READ_BY_ME", "PLAYED", "4"].includes(normalized)) return "lido";
  if (["DELIVERY_ACK", "DELIVERED", "3", "2"].includes(normalized)) return "entregue";
  if (["SERVER_ACK", "SENT", "1"].includes(normalized)) return "enviado";
  return "falha";
}

function firstDefinedString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeTextCandidate(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const objectValue = value as Record<string, unknown>;
  for (const candidate of [objectValue.message, objectValue.text, objectValue.body, objectValue.caption, objectValue.content]) {
    const normalized = normalizeTextCandidate(candidate);
    if (normalized) return normalized;
  }
  return "";
}
