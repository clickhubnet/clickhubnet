import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Prisma } from "@prisma/client";
import { writeTechnicalLog } from "@/lib/logger";
import { normalizePhone as normalizeBrazilianPhone } from "@/services/validators";

type SendMetaTextInput = {
  to: string;
  message: string;
  previewUrl?: boolean;
};

type SendMetaMediaInput = {
  to: string;
  media: string;
  kind: "imagem" | "video" | "documento";
  caption?: string;
  fileName?: string;
  mimeType?: string;
};

type SendMetaTemplateInput = {
  to: string;
  templateName?: string;
  languageCode?: string;
  bodyParameters?: string[];
  media?: string;
  kind?: "imagem" | "video" | "documento";
  mimeType?: string;
  fileName?: string;
};

export type ParsedMetaWebhook =
  | {
      event: "message";
      phone: string;
      contactName: string;
      kind: "texto" | "imagem" | "audio" | "video" | "documento";
      message: string;
      mediaId?: string;
      mediaUrl?: string;
      mimeType?: string;
      fileName?: string;
      messageId: string;
      direction: "entrada";
      raw: Record<string, unknown>;
    }
  | {
      event: "status";
      updates: Array<{ messageId: string; status: "enviado" | "entregue" | "lido" | "falha" }>;
      raw: Record<string, unknown>;
    };

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizePhone(value: string) {
  return normalizeBrazilianPhone(value);
}

export function isMetaWhatsAppEnabled() {
  return process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() === "meta";
}

export function getMetaWhatsAppConfig() {
  const graphVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v23.0";
  const baseUrl = trimTrailingSlash(process.env.META_WHATSAPP_API_URL?.trim() || `https://graph.facebook.com/${graphVersion}`);
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || "";
  const businessAccountId = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || "";
  const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim() || "";
  const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim() || "";
  const defaultNumber = process.env.META_WHATSAPP_DEFAULT_NUMBER?.trim() || "";
  const broadcastTemplateName = process.env.META_WHATSAPP_BROADCAST_TEMPLATE_NAME?.trim() || "";
  const broadcastTemplateLanguage = process.env.META_WHATSAPP_BROADCAST_TEMPLATE_LANGUAGE?.trim() || "pt_BR";

  if (!accessToken || !phoneNumberId) {
    throw new Error("Credenciais da Meta WhatsApp API nao configuradas no backend.");
  }

  return {
    baseUrl,
    accessToken,
    phoneNumberId,
    businessAccountId,
    verifyToken,
    appSecret,
    defaultNumber,
    broadcastTemplateName,
    broadcastTemplateLanguage,
    messagesUrl: `${baseUrl}/${phoneNumberId}/messages`,
    mediaUrl: `${baseUrl}/${phoneNumberId}/media`,
  };
}

export function verifyMetaWebhookChallenge(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && challenge && expectedToken && token === expectedToken) {
    return challenge;
  }

  return null;
}

export function isValidMetaWebhook(request: Request, rawBody: string) {
  const appSecret = process.env.META_WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) return true;
  const signature = request.headers.get("x-hub-signature-256")?.trim() || "";
  if (!signature.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return signatureBytes.length === expectedBytes.length && timingSafeEqual(signatureBytes, expectedBytes);
}

export async function sendMetaTextMessage(input: SendMetaTextInput) {
  const config = getMetaWhatsAppConfig();
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(input.to),
    type: "text",
    text: {
      preview_url: input.previewUrl ?? false,
      body: input.message,
    },
  };
  return postMetaJson(config.messagesUrl, config.accessToken, payload);
}

export async function sendMetaMediaMessage(input: SendMetaMediaInput) {
  const config = getMetaWhatsAppConfig();
  const mediaReference = await resolveMetaMediaReference(input);
  const type = metaMediaType(input.kind);
  return postMetaJson(config.messagesUrl, config.accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(input.to),
    type,
    [type]: {
      ...mediaReference,
      caption: input.caption?.trim() || undefined,
      filename: input.kind === "documento" ? input.fileName?.trim() || "documento" : undefined,
    },
  });
}

export async function sendMetaTemplateMessage(input: SendMetaTemplateInput) {
  const config = getMetaWhatsAppConfig();
  const templateName = input.templateName?.trim() || config.broadcastTemplateName;
  if (!templateName) {
    throw new Error("Template da Meta nao configurado para disparo ativo.");
  }

  const components: Array<Record<string, unknown>> = [];
  if (input.media && input.kind) {
    const mediaReference = await resolveMetaMediaReference({
      media: input.media,
      kind: input.kind,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    const type = metaMediaType(input.kind);
    components.push({
      type: "header",
      parameters: [{ type, [type]: mediaReference }],
    });
  }
  if (input.bodyParameters?.length) {
    components.push({
      type: "body",
      parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
    });
  }

  return postMetaJson(config.messagesUrl, config.accessToken, {
    messaging_product: "whatsapp",
    to: normalizePhone(input.to),
    type: "template",
    template: {
      name: templateName,
      language: { code: input.languageCode || config.broadcastTemplateLanguage },
      ...(components.length ? { components } : {}),
    },
  });
}

export async function markMetaMessageAsRead(messageId: string) {
  const config = getMetaWhatsAppConfig();
  try {
    await postMetaJson(config.messagesUrl, config.accessToken, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
    return true;
  } catch (error) {
    await writeTechnicalLog({
      level: "ERROR",
      category: "integration",
      message: "Meta WhatsApp recusou marcar mensagem como lida.",
      method: "POST",
      endpoint: "/messages",
      integration: "meta-whatsapp",
      metadata: { error: error instanceof Error ? error.message : "unknown" },
    });
    return false;
  }
}

export async function checkMetaWhatsAppNumber(input: string) {
  const phone = normalizePhone(input);
  return {
    exists: Boolean(phone),
    phone,
    raw: { provider: "meta-whatsapp", note: "A Cloud API confirma numeros apenas na tentativa de envio." },
  };
}

export async function getMetaMediaDownloadUrl(mediaId: string) {
  const config = getMetaWhatsAppConfig();
  const result = await getMetaJson(`${config.baseUrl}/${encodeURIComponent(mediaId)}`, config.accessToken);
  const url = result && typeof result === "object" && typeof (result as { url?: unknown }).url === "string"
    ? (result as { url: string }).url
    : "";
  if (!url) throw new Error("Meta nao retornou URL da midia.");
  return url;
}

export async function downloadMetaMediaBytes(mediaId: string) {
  const config = getMetaWhatsAppConfig();
  const url = await getMetaMediaDownloadUrl(mediaId);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Meta recusou download da midia HTTP ${response.status}.`);
  return {
    bytes: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export function parseMetaWebhookPayload(payload: Record<string, unknown>): ParsedMetaWebhook | null {
  const value = firstWebhookValue(payload);
  if (!value) return null;
  const statuses = Array.isArray(value.statuses) ? value.statuses : [];
  if (statuses.length) {
    return {
      event: "status",
      raw: payload,
      updates: statuses.flatMap((status) => {
        if (!status || typeof status !== "object") return [];
        const item = status as Record<string, unknown>;
        const messageId = typeof item.id === "string" ? item.id : "";
        if (!messageId) return [];
        return [{ messageId, status: mapMetaStatus(item.status) }];
      }),
    };
  }

  const messages = Array.isArray(value.messages) ? value.messages : [];
  const message = messages.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  if (!message) return null;

  const contacts = Array.isArray(value.contacts) ? value.contacts : [];
  const contact = contacts.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const profile = contact?.profile && typeof contact.profile === "object" ? contact.profile as Record<string, unknown> : {};
  const kind = resolveMetaKind(message);
  const media = resolveMetaMedia(message, kind);
  return {
    event: "message",
    phone: normalizePhone(String(message.from ?? contact?.wa_id ?? "")),
    contactName: typeof profile.name === "string" ? profile.name : "",
    kind,
    message: resolveMetaText(message, kind),
    mediaId: media.mediaId,
    mediaUrl: media.mediaUrl,
    mimeType: media.mimeType,
    fileName: media.fileName,
    messageId: String(message.id ?? `${message.from ?? "meta"}-${Date.now()}`),
    direction: "entrada",
    raw: payload,
  };
}

async function resolveMetaMediaReference(input: Omit<SendMetaMediaInput, "to">) {
  const normalizedMedia = input.media.trim();
  if (/^https?:\/\//i.test(normalizedMedia)) {
    return { link: normalizedMedia };
  }
  return { id: await uploadMetaMedia(input) };
}

async function uploadMetaMedia(input: Omit<SendMetaMediaInput, "to">) {
  const config = getMetaWhatsAppConfig();
  const normalizedMedia = input.media.trim();
  const dataUrlMatch = normalizedMedia.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = input.mimeType?.trim() || dataUrlMatch?.[1] || "application/octet-stream";
  const base64 = dataUrlMatch?.[2] || normalizedMedia;
  const bytes = Buffer.from(base64.replace(/\s/g, ""), "base64");
  const fileName = input.fileName?.trim() || defaultFileName(input.kind, mimeType);
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("file", new Blob([bytes], { type: mimeType }), fileName);

  const response = await fetch(config.mediaUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await parseMetaResponse(response);
  if (!response.ok) throw new Error(formatMetaError(result, "Meta recusou upload da midia."));
  const mediaId = result && typeof result === "object" && typeof (result as { id?: unknown }).id === "string"
    ? (result as { id: string }).id
    : "";
  if (!mediaId) throw new Error("Meta nao retornou id da midia enviada.");
  return mediaId;
}

async function postMetaJson(url: string, accessToken: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const result = await parseMetaResponse(response);
  if (!response.ok) throw new Error(formatMetaError(result, "Meta WhatsApp recusou a requisicao."));
  return result;
}

async function getMetaJson(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result = await parseMetaResponse(response);
  if (!response.ok) throw new Error(formatMetaError(result, "Meta WhatsApp recusou a requisicao."));
  return result;
}

async function parseMetaResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

function firstWebhookValue(payload: Record<string, unknown>) {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
  if (!entry || typeof entry !== "object") return null;
  const changes = Array.isArray((entry as { changes?: unknown }).changes) ? (entry as { changes: unknown[] }).changes : [];
  const change = changes.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const value = change?.value;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function resolveMetaKind(message: Record<string, unknown>): "texto" | "imagem" | "audio" | "video" | "documento" {
  const type = String(message.type ?? "").toLowerCase();
  if (type === "image") return "imagem";
  if (type === "audio") return "audio";
  if (type === "video") return "video";
  if (type === "document") return "documento";
  return "texto";
}

function resolveMetaText(message: Record<string, unknown>, kind: string) {
  if (kind === "texto") {
    const text = message.text && typeof message.text === "object" ? message.text as Record<string, unknown> : {};
    return typeof text.body === "string" ? text.body.trim() : "";
  }
  const mediaKey = kind === "imagem" ? "image" : kind === "audio" ? "audio" : kind === "video" ? "video" : "document";
  const media = message[mediaKey] && typeof message[mediaKey] === "object" ? message[mediaKey] as Record<string, unknown> : {};
  return typeof media.caption === "string" ? media.caption.trim() : "";
}

function resolveMetaMedia(message: Record<string, unknown>, kind: string) {
  if (kind === "texto") return {};
  const mediaKey = kind === "imagem" ? "image" : kind === "audio" ? "audio" : kind === "video" ? "video" : "document";
  const media = message[mediaKey] && typeof message[mediaKey] === "object" ? message[mediaKey] as Record<string, unknown> : {};
  return {
    mediaId: typeof media.id === "string" ? media.id : undefined,
    mediaUrl: typeof media.link === "string" ? media.link : undefined,
    mimeType: typeof media.mime_type === "string" ? media.mime_type : undefined,
    fileName: typeof media.filename === "string" ? media.filename : undefined,
  };
}

function mapMetaStatus(value: unknown): "enviado" | "entregue" | "lido" | "falha" {
  const status = String(value ?? "").toLowerCase();
  if (status === "read") return "lido";
  if (status === "delivered") return "entregue";
  if (status === "sent") return "enviado";
  return "falha";
}

function metaMediaType(kind: "imagem" | "video" | "documento") {
  if (kind === "imagem") return "image";
  if (kind === "video") return "video";
  return "document";
}

function defaultFileName(kind: "imagem" | "video" | "documento", mimeType: string) {
  const extension = mimeType.split("/")[1]?.split(";")[0] || "bin";
  if (kind === "imagem") return `imagem.${extension}`;
  if (kind === "video") return `video.${extension}`;
  return `documento.${extension}`;
}

function formatMetaError(result: unknown, fallbackMessage: string) {
  if (result && typeof result === "object") return JSON.stringify(result);
  if (typeof result === "string" && result.trim()) return result;
  return fallbackMessage;
}

export function normalizeMetaJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
