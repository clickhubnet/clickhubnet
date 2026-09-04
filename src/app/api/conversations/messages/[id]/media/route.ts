import { NextResponse } from "next/server";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/permissions";
import { getEvolutionConfig } from "@/services/evolution";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const { id } = await context.params;
    const message = await prisma.chatMessage.findUnique({
      where: { id },
      select: { rawPayload: true },
    });

    const rawPayload = message?.rawPayload;
    const media = resolveMedia(rawPayload);
    if (!media?.source) {
      return NextResponse.json(errorResponse("Midia nao encontrada.", "NOT_FOUND"), { status: 404 });
    }

    const headers = new Headers();
    headers.set("Content-Type", media.mimeType || "application/octet-stream");
    headers.set("Content-Disposition", `inline; filename="${sanitizeFileName(media.fileName || "midia")}"`);

    if (media.source.startsWith("data:")) {
      const parsed = parseDataUrl(media.source);
      if (!parsed) {
        return NextResponse.json(errorResponse("Midia invalida.", "INVALID_MEDIA"), { status: 422 });
      }
      headers.set("Content-Type", parsed.mimeType || media.mimeType || "application/octet-stream");
      return new Response(Buffer.from(parsed.base64, "base64"), { headers });
    }

    if (looksLikeBase64(media.source)) {
      return new Response(Buffer.from(media.source, "base64"), { headers });
    }

    if (/^https?:\/\//i.test(media.source)) {
      const config = getEvolutionConfig();
      const response = await fetch(media.source, {
        headers: { apikey: config.apiKey },
        cache: "no-store",
      });
      if (response.ok && response.body) {
        headers.set("Content-Type", response.headers.get("content-type") || media.mimeType || "application/octet-stream");
        return new Response(response.body, { headers });
      }
    }

    const downloaded = await downloadEvolutionMedia(rawPayload);
    if (downloaded?.base64) {
      headers.set("Content-Type", downloaded.mimeType || media.mimeType || "application/octet-stream");
      return new Response(Buffer.from(stripDataUrl(downloaded.base64), "base64"), { headers });
    }

    return NextResponse.json(errorResponse("Nao foi possivel baixar a midia.", "MEDIA_DOWNLOAD_ERROR"), { status: 502 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel abrir a midia."), { status: 500 });
  }
}

async function downloadEvolutionMedia(rawPayload: unknown) {
  const message = resolveWebhookMessage(rawPayload);
  if (!message) return null;
  const config = getEvolutionConfig();
  const endpoints = [
    `${config.baseUrl}/message/downloadmedia`,
    `${config.baseUrl}/message/downloadMedia`,
    `${config.baseUrl}/message/downloadimage`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.apiKey,
        },
        body: JSON.stringify({ message }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || !result) continue;
      const data = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : result;
      const base64 = firstString([data.base64, data.media, data.file, result.base64]);
      if (base64) {
        return {
          base64,
          mimeType: firstString([data.mimeType, data.mimetype, result.mimeType, result.mimetype]),
        };
      }
    } catch {
      // Tenta o proximo endpoint, pois versoes diferentes usam nomes diferentes.
    }
  }

  return null;
}

function resolveWebhookMessage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const raw = payload.raw && typeof payload.raw === "object" && !Array.isArray(payload.raw)
    ? payload.raw as Record<string, unknown>
    : payload;
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
    ? raw.data as Record<string, unknown>
    : raw;
  const message = data.message ?? raw.message ?? payload.message;
  return message && typeof message === "object" && !Array.isArray(message) ? message : null;
}

function resolveMedia(value: unknown): { source?: string; mimeType?: string; fileName?: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  const media = payload.media && typeof payload.media === "object" && !Array.isArray(payload.media)
    ? payload.media as Record<string, unknown>
    : {};
  const raw = payload.raw && typeof payload.raw === "object" && !Array.isArray(payload.raw)
    ? payload.raw as Record<string, unknown>
    : {};
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
    ? raw.data as Record<string, unknown>
    : raw;
  const message = data.message && typeof data.message === "object" && !Array.isArray(data.message)
    ? data.message as Record<string, unknown>
    : {};
  const imageMessage = message.imageMessage && typeof message.imageMessage === "object" && !Array.isArray(message.imageMessage)
    ? message.imageMessage as Record<string, unknown>
    : {};
  const videoMessage = message.videoMessage && typeof message.videoMessage === "object" && !Array.isArray(message.videoMessage)
    ? message.videoMessage as Record<string, unknown>
    : {};
  const audioMessage = message.audioMessage && typeof message.audioMessage === "object" && !Array.isArray(message.audioMessage)
    ? message.audioMessage as Record<string, unknown>
    : {};
  const documentMessage = message.documentMessage && typeof message.documentMessage === "object" && !Array.isArray(message.documentMessage)
    ? message.documentMessage as Record<string, unknown>
    : {};

  const candidates = [payload, media, data, imageMessage, videoMessage, audioMessage, documentMessage];
  return {
    source: firstString(candidates.flatMap((item) => [
      item.mediaUrl,
      item.url,
      item.imageUrl,
      item.audioUrl,
      item.videoUrl,
      item.documentUrl,
      item.base64,
      item.data,
    ])),
    mimeType: firstString(candidates.flatMap((item) => [item.mimeType, item.mimetype])),
    fileName: firstString(candidates.flatMap((item) => [item.fileName, item.filename, item.title])),
  };
}

function firstString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function parseDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function stripDataUrl(value: string) {
  const parsed = parseDataUrl(value);
  return parsed?.base64 ?? value;
}

function looksLikeBase64(value: string) {
  const normalized = value.trim();
  if (normalized.length < 32 || /^https?:\/\//i.test(normalized)) return false;
  return /^[a-zA-Z0-9+/=\r\n]+$/.test(normalized);
}

function sanitizeFileName(value: string) {
  return value.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "midia";
}
