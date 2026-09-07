import { NextResponse } from "next/server";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { checkEvolutionWhatsAppNumber, getEvolutionConfig } from "@/services/evolution";
import { getMetaWhatsAppConfig, isMetaWhatsAppEnabled } from "@/services/meta-whatsapp";

type HealthStatus = "ok" | "warning" | "error";

type EvolutionCheck = {
  key: string;
  label: string;
  status: HealthStatus;
  durationMs: number;
  message: string;
  details?: unknown;
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);

    if (isMetaWhatsAppEnabled()) {
      return handleMetaHealth();
    }

    const config = getEvolutionConfig();
    const startedAt = Date.now();
    const [connection, webhook, defaultNumber, broadcastQueue, recentLogs] = await Promise.all([
      checkConnectionState(config),
      checkWebhook(config),
      checkDefaultNumber(config),
      getBroadcastQueueSummary(),
      getRecentWhatsAppLogs(),
    ]);

    const checks = [connection, webhook, defaultNumber];
    const overall = resolveOverallStatus(checks, broadcastQueue);

    return NextResponse.json(successResponse("Saude da Evolution consultada.", {
      overall,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      config: {
        apiUrl: config.baseUrl,
        instance: config.instanceName,
        defaultNumber: maskPhone(config.defaultNumber),
        webhookUrl: process.env.EVOLUTION_WEBHOOK_URL?.trim() || "",
        cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
        broadcast: {
          minDelaySeconds: Number(process.env.WHATSAPP_BROADCAST_MIN_DELAY_SECONDS ?? 60),
          maxDelaySeconds: Number(process.env.WHATSAPP_BROADCAST_MAX_DELAY_SECONDS ?? 140),
          maxBatchSize: Number(process.env.WHATSAPP_BROADCAST_MAX_BATCH_SIZE ?? 205),
          maxPerHour: Number(process.env.WHATSAPP_BROADCAST_MAX_PER_HOUR ?? 35),
        },
      },
      checks,
      broadcastQueue,
      recentLogs,
    }));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      errorResponse(error instanceof Error ? error.message : "Nao foi possivel consultar a saude da Evolution."),
      { status: 500 },
    );
  }
}

async function handleMetaHealth() {
  const config = getMetaWhatsAppConfig();
  const startedAt = Date.now();
  const [connection, webhook, defaultNumber, broadcastQueue, recentLogs] = await Promise.all([
    checkMetaPhoneNumber(config),
    checkMetaWebhookConfig(config),
    checkMetaDefaultNumber(config),
    getBroadcastQueueSummary(),
    getRecentWhatsAppLogs(),
  ]);
  const checks = [connection, webhook, defaultNumber];
  const overall = resolveOverallStatus(checks, broadcastQueue);

  return NextResponse.json(successResponse("Saude da Meta WhatsApp consultada.", {
    overall,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    config: {
      apiUrl: config.baseUrl,
      instance: config.phoneNumberId,
      defaultNumber: maskPhone(config.defaultNumber),
      webhookUrl: process.env.META_WHATSAPP_WEBHOOK_URL?.trim() || process.env.EVOLUTION_WEBHOOK_URL?.trim() || "",
      cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      broadcast: {
        minDelaySeconds: Number(process.env.WHATSAPP_BROADCAST_MIN_DELAY_SECONDS ?? 60),
        maxDelaySeconds: Number(process.env.WHATSAPP_BROADCAST_MAX_DELAY_SECONDS ?? 140),
        maxBatchSize: Number(process.env.WHATSAPP_BROADCAST_MAX_BATCH_SIZE ?? 205),
        maxPerHour: Number(process.env.WHATSAPP_BROADCAST_MAX_PER_HOUR ?? 35),
      },
    },
    checks,
    broadcastQueue,
    recentLogs,
  }));
}

async function checkMetaPhoneNumber(config: ReturnType<typeof getMetaWhatsAppConfig>): Promise<EvolutionCheck> {
  return timedCheck("meta-phone-number", "Phone Number ID", async () => {
    const result = await metaJsonFetch(`${config.baseUrl}/${encodeURIComponent(config.phoneNumberId)}`, config.accessToken);
    const displayPhoneNumber = String(readPath(result, ["display_phone_number"]) ?? "");
    const verifiedName = String(readPath(result, ["verified_name"]) ?? "");
    return {
      status: "ok" as const,
      message: `Meta respondeu para ${verifiedName || displayPhoneNumber || "o numero configurado"}.`,
      details: { displayPhoneNumber, verifiedName },
    };
  });
}

async function checkMetaWebhookConfig(config: ReturnType<typeof getMetaWhatsAppConfig>): Promise<EvolutionCheck> {
  return timedCheck("meta-webhook", "Webhook Meta", async () => {
    const webhookUrl = process.env.META_WHATSAPP_WEBHOOK_URL?.trim() || process.env.EVOLUTION_WEBHOOK_URL?.trim();
    const hasVerifyToken = Boolean(config.verifyToken);
    return {
      status: webhookUrl && hasVerifyToken ? "ok" as const : "warning" as const,
      message: webhookUrl && hasVerifyToken ? "Webhook pronto para verificacao da Meta." : "Configure URL do webhook e token de verificacao da Meta.",
      details: { webhookUrl, verifyTokenConfigured: hasVerifyToken, appSecretConfigured: Boolean(config.appSecret) },
    };
  });
}

async function checkMetaDefaultNumber(config: ReturnType<typeof getMetaWhatsAppConfig>): Promise<EvolutionCheck> {
  return timedCheck("meta-default-number", "Número padrão", async () => ({
    status: config.defaultNumber ? "ok" as const : "warning" as const,
    message: config.defaultNumber ? "Número padrão da Meta configurado." : "META_WHATSAPP_DEFAULT_NUMBER nao configurado.",
    details: { phone: maskPhone(config.defaultNumber) },
  }));
}

async function checkConnectionState(config: ReturnType<typeof getEvolutionConfig>): Promise<EvolutionCheck> {
  return timedCheck("connection", "Conexão da instância", async () => {
    const result = await evolutionJsonFetch(`${config.baseUrl}/instance/connectionState/${encodeURIComponent(config.instanceName)}`, config.apiKey);
    const state = String(readPath(result, ["instance", "state"]) ?? readPath(result, ["state"]) ?? readPath(result, ["data", "state"]) ?? "").toLowerCase();
    const connected = ["open", "connected", "online"].includes(state) || JSON.stringify(result).toLowerCase().includes("open");
    return {
      status: connected ? "ok" as const : "warning" as const,
      message: connected ? "Instância conectada." : `Estado retornado: ${state || "nao identificado"}.`,
      details: compactDetails(result),
    };
  });
}

async function checkWebhook(config: ReturnType<typeof getEvolutionConfig>): Promise<EvolutionCheck> {
  return timedCheck("webhook", "Webhook configurado", async () => {
    const result = await evolutionJsonFetch(`${config.baseUrl}/webhook/find/${encodeURIComponent(config.instanceName)}`, config.apiKey);
    const expected = process.env.EVOLUTION_WEBHOOK_URL?.trim();
    const foundUrl = findUrl(result);
    const enabled = JSON.stringify(result).toLowerCase().includes("true") || Boolean(foundUrl);
    const urlMatches = expected && foundUrl ? normalizeUrl(foundUrl) === normalizeUrl(expected) : false;
    return {
      status: enabled && (!expected || urlMatches) ? "ok" as const : "warning" as const,
      message: urlMatches ? "Webhook ativo e apontando para o CRM." : foundUrl ? `Webhook encontrado: ${foundUrl}` : "Webhook nao identificado pela Evolution.",
      details: { expected, found: foundUrl, enabled },
    };
  });
}

async function checkDefaultNumber(config: ReturnType<typeof getEvolutionConfig>): Promise<EvolutionCheck> {
  return timedCheck("default-number", "Número padrão", async () => {
    if (!config.defaultNumber) {
      return { status: "warning" as const, message: "EVOLUTION_DEFAULT_NUMBER nao configurado." };
    }
    const result = await checkEvolutionWhatsAppNumber(config.defaultNumber);
    return {
      status: result.exists ? "ok" as const : "warning" as const,
      message: result.exists ? "Número padrão validado com WhatsApp." : "Número padrão não foi confirmado como WhatsApp.",
      details: { phone: maskPhone(result.phone), jid: result.jid },
    };
  });
}

async function timedCheck(
  key: string,
  label: string,
  run: () => Promise<{ status: HealthStatus; message: string; details?: unknown }>,
): Promise<EvolutionCheck> {
  const startedAt = Date.now();
  try {
    const result = await run();
    return { key, label, durationMs: Date.now() - startedAt, ...result };
  } catch (error) {
    return {
      key,
      label,
      status: "error",
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Falha ao consultar WhatsApp API.",
    };
  }
}

async function evolutionJsonFetch(url: string, apiKey: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: { apikey: apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  const result = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    throw new Error(`Evolution respondeu HTTP ${response.status}: ${typeof result === "string" ? result : JSON.stringify(result)}`);
  }
  return result;
}

async function metaJsonFetch(url: string, accessToken: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const text = await response.text();
  const result = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    throw new Error(`Meta respondeu HTTP ${response.status}: ${typeof result === "string" ? result : JSON.stringify(result)}`);
  }
  return result;
}

async function getBroadcastQueueSummary() {
  const rows = await prisma.$queryRaw<Array<{
    totalDispatches: number;
    pendingRecipients: number;
    processingRecipients: number;
    sentRecipients: number;
    failedRecipients: number;
    noWhatsappRecipients: number;
    canceledRecipients: number;
    pausedRecipients: number;
  }>>`
    SELECT
      COALESCE(jsonb_array_length("value"::jsonb), 0)::int AS "totalDispatches",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' = 'agendado'
      ), 0)::int AS "pendingRecipients",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' = 'processando'
      ), 0)::int AS "processingRecipients",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' = 'enviado'
      ), 0)::int AS "sentRecipients",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' IN ('falha_envio', 'falha_validacao')
      ), 0)::int AS "failedRecipients",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' = 'sem_whatsapp'
      ), 0)::int AS "noWhatsappRecipients",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' = 'cancelado'
      ), 0)::int AS "canceledRecipients",
      COALESCE((
        SELECT count(*)::int
        FROM jsonb_array_elements("value"::jsonb) dispatch,
        LATERAL jsonb_array_elements(COALESCE(dispatch->'recipientStatuses', '[]'::jsonb)) recipient
        WHERE recipient->>'status' = 'auto_pausado'
      ), 0)::int AS "pausedRecipients"
    FROM "AppSetting"
    WHERE "key" = 'whatsappBroadcastDispatches'
    LIMIT 1
  `;

  return rows[0] ?? {
    totalDispatches: 0,
    pendingRecipients: 0,
    processingRecipients: 0,
    sentRecipients: 0,
    failedRecipients: 0,
    noWhatsappRecipients: 0,
    canceledRecipients: 0,
    pausedRecipients: 0,
  };
}

async function getRecentWhatsAppLogs() {
  const logs = await prisma.technicalLog.findMany({
    where: {
      OR: [
        { integration: "evolution" },
        { integration: "meta-whatsapp" },
        { endpoint: { contains: "/api/whatsapp" } },
        { message: { contains: "Evolution" } },
        { message: { contains: "Meta" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      level: true,
      category: true,
      message: true,
      endpoint: true,
      statusCode: true,
      createdAt: true,
    },
  });

  return logs.map((log) => ({
    ...log,
    createdAt: log.createdAt.toISOString(),
  }));
}

function resolveOverallStatus(checks: EvolutionCheck[], queue: Awaited<ReturnType<typeof getBroadcastQueueSummary>>): HealthStatus {
  if (checks.some((check) => check.status === "error")) return "error";
  if (queue.processingRecipients > 0 || queue.failedRecipients > 0 || checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function readPath(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function findUrl(value: unknown): string {
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? value : "";
  if (!value || typeof value !== "object") return "";
  const object = value as Record<string, unknown>;
  for (const key of ["url", "webhookUrl", "webhook", "baseWebhookUrl"]) {
    const candidate = object[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
  }
  for (const candidate of Object.values(object)) {
    const found = findUrl(candidate);
    if (found) return found;
  }
  return "";
}

function normalizeUrl(value: string) {
  return value.replace(/^https?:\/\/www\./i, "https://").replace(/\/+$/, "");
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}••••${digits.slice(-4)}`;
}

function compactDetails(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return {
    state: readPath(value, ["instance", "state"]) ?? object.state ?? readPath(value, ["data", "state"]),
    instance: readPath(value, ["instance", "instanceName"]) ?? object.instanceName ?? object.instance,
  };
}
