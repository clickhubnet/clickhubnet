import "server-only";

import type { Prisma } from "@prisma/client";
import {
  WHATSAPP_BROADCAST_AUTO_PAUSE_FAILURES,
  WHATSAPP_BROADCAST_MAX_DELAY_SECONDS,
  WHATSAPP_BROADCAST_MIN_DELAY_SECONDS,
} from "@/config/whatsapp-broadcast";
import { prisma } from "@/lib/prisma";
import { checkEvolutionWhatsAppNumber, sendEvolutionMediaMessage, sendEvolutionTextMessage } from "@/services/evolution";

const BROADCAST_HISTORY_KEY = "whatsappBroadcastDispatches";

export type BroadcastRecipientStatus = {
  phone: string;
  status: "agendado" | "processando" | "enviado" | "sem_whatsapp" | "falha_validacao" | "falha_envio" | "auto_pausado" | "cancelado";
  error: string | null;
  checkedAt: string | null;
  sentAt: string | null;
  scheduledFor: string | null;
  blockLabel: string | null;
};

export type BroadcastDispatchRecord = {
  id: string;
  batchId: string;
  title: string;
  message: string;
  media?: string;
  mediaKind?: "imagem";
  mimeType?: string;
  fileName?: string;
  status: string;
  ownerUserId?: string;
  total: number;
  sent: number;
  failed: number;
  invalid: number;
  duplicate: number;
  recipientStatuses: BroadcastRecipientStatus[];
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export type BroadcastScheduleBlock = {
  time: string;
  quantity: number;
};

export type BroadcastProcessMessage = {
  dispatchId: string;
  phone: string;
  message: string;
  media?: string;
  mediaKind?: "imagem";
  mimeType?: string;
  fileName?: string;
  ownerUserId?: string;
};

export function createBroadcastDispatch(input: {
  batchId: string;
  message: string;
  media?: string;
  mediaKind?: "imagem";
  mimeType?: string;
  fileName?: string;
  phones: string[];
  invalidPhones: string[];
  duplicatePhones: string[];
  scheduleBlocks: BroadcastScheduleBlock[];
  sendNow?: boolean;
  ownerUserId?: string;
}) {
  const now = new Date().toISOString();
  const scheduledRecipients = buildRecipientSchedule(input.phones, input.sendNow ? [] : input.scheduleBlocks, input.sendNow);
  return {
    id: crypto.randomUUID(),
    batchId: input.batchId,
    title: `Disparo em lote ${new Date().toLocaleDateString("pt-BR")}`,
    message: input.message,
    media: input.media,
    mediaKind: input.mediaKind,
    mimeType: input.mimeType,
    fileName: input.fileName,
    status: "agendado",
    ownerUserId: input.ownerUserId,
    total: input.phones.length + input.invalidPhones.length + input.duplicatePhones.length,
    sent: 0,
    failed: 0,
    invalid: input.invalidPhones.length,
    duplicate: input.duplicatePhones.length,
    recipientStatuses: scheduledRecipients.map((recipient) => ({
      phone: recipient.phone,
      status: "agendado",
      error: null,
      checkedAt: null,
      sentAt: null,
      scheduledFor: recipient.scheduledFor,
      blockLabel: recipient.blockLabel,
    })),
    createdAt: now,
    updatedAt: now,
    metadata: {
      invalidPhones: input.invalidPhones,
      duplicatePhones: input.duplicatePhones,
      scheduleBlocks: input.scheduleBlocks,
      sendNow: Boolean(input.sendNow),
      minDelaySeconds: WHATSAPP_BROADCAST_MIN_DELAY_SECONDS,
      maxDelaySeconds: WHATSAPP_BROADCAST_MAX_DELAY_SECONDS,
    },
  } satisfies BroadcastDispatchRecord;
}

export async function listBroadcastDispatches() {
  return readBroadcastHistory();
}

export async function saveBroadcastDispatch(dispatch: BroadcastDispatchRecord) {
  const history = await readBroadcastHistory();
  await writeBroadcastHistory([dispatch, ...history.filter((item) => item.id !== dispatch.id)].slice(0, 20));
}

export async function deleteBroadcastDispatches(ids?: string[]) {
  const history = await readBroadcastHistory();
  if (!ids?.length) {
    await writeBroadcastHistory([]);
    return { deleted: history.length };
  }
  const idSet = new Set(ids);
  const nextHistory = history.filter((dispatch) => !idSet.has(dispatch.id));
  await writeBroadcastHistory(nextHistory);
  return { deleted: history.length - nextHistory.length };
}

export async function cancelBroadcastDispatches(ids: string[]) {
  const idSet = new Set(ids);
  const history = await readBroadcastHistory();
  let canceled = 0;
  const nextHistory = history.map((dispatch) => {
    if (!idSet.has(dispatch.id)) return dispatch;
    canceled += 1;
    return {
      ...dispatch,
      status: "cancelado",
      updatedAt: new Date().toISOString(),
      recipientStatuses: dispatch.recipientStatuses.map((recipient) =>
        recipient.status === "agendado" || recipient.status === "processando"
          ? {
              ...recipient,
              status: "cancelado" as const,
              error: "Agendamento cancelado manualmente.",
              checkedAt: recipient.checkedAt ?? new Date().toISOString(),
            }
          : recipient,
      ),
    };
  });
  await writeBroadcastHistory(nextHistory);
  return { canceled };
}

export async function processDueBroadcasts(limit = 5) {
  const now = Date.now();
  const history = await readBroadcastHistory();
  const dueMessages = history.flatMap((dispatch) => {
    if (["concluido", "concluido_parcial", "concluido_sem_envios", "auto_pausado", "cancelado"].includes(dispatch.status)) return [];
    return dispatch.recipientStatuses
      .filter((recipient) => recipient.status === "agendado")
      .filter((recipient) => !recipient.scheduledFor || new Date(recipient.scheduledFor).getTime() <= now)
      .map((recipient) => ({
        dispatchId: dispatch.id,
        phone: recipient.phone,
        message: dispatch.message,
        media: dispatch.media,
        mediaKind: dispatch.mediaKind,
        mimeType: dispatch.mimeType,
        fileName: dispatch.fileName,
        ownerUserId: dispatch.ownerUserId,
        scheduledFor: recipient.scheduledFor,
      }));
  }).sort((left, right) => {
    return new Date(left.scheduledFor ?? 0).getTime() - new Date(right.scheduledFor ?? 0).getTime();
  }).slice(0, limit);

  for (const item of dueMessages) {
    await processBroadcastMessage(item);
  }

  return { processed: dueMessages.length };
}

export async function processBroadcastMessage(message: BroadcastProcessMessage) {
  const dispatch = await findBroadcastDispatch(message.dispatchId);
  if (!dispatch) return;

  const currentSummary = summarizeStatuses(dispatch.recipientStatuses);
  if (currentSummary.falhaEnvio + currentSummary.falhaValidacao >= WHATSAPP_BROADCAST_AUTO_PAUSE_FAILURES) {
    await patchRecipientStatus(message.dispatchId, message.phone, {
      status: "auto_pausado",
      error: "Disparo pausado automaticamente por excesso de falhas.",
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  await patchRecipientStatus(message.dispatchId, message.phone, {
    status: "processando",
    checkedAt: new Date().toISOString(),
  });

  try {
    const check = await checkEvolutionWhatsAppNumber(message.phone);
    if (!check.exists) {
      await patchRecipientStatus(message.dispatchId, message.phone, {
        status: "sem_whatsapp",
        error: "Numero sem WhatsApp ativo.",
        checkedAt: new Date().toISOString(),
      });
      return;
    }
  } catch (error) {
    await patchRecipientStatus(message.dispatchId, message.phone, {
      status: "falha_validacao",
      error: error instanceof Error ? error.message : "Falha ao validar numero na Evolution API.",
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const result = message.media && message.mediaKind
      ? await sendEvolutionMediaMessage({
          to: message.phone,
          media: message.media,
          kind: message.mediaKind,
          caption: message.message,
          mimeType: message.mimeType,
          fileName: message.fileName,
        })
      : await sendEvolutionTextMessage({ to: message.phone, message: message.message, delayTypingSeconds: 2 });
    const providerId = resolveEvolutionMessageId(result);
    const conversation = await findOrCreateBroadcastConversation({
      phone: message.phone,
      ownerUserId: message.ownerUserId,
    });
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        body: message.media ? `Imagem enviada${message.message ? `\n${message.message}` : ""}` : message.message,
        providerId,
        sentAt: new Date(),
        rawPayload: normalizeJson({
          provider: "evolution",
          source: "broadcast",
          media: message.media ? { kind: message.mediaKind, mimeType: message.mimeType, fileName: message.fileName } : undefined,
          result,
        }),
      },
    });
    await prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    await patchRecipientStatus(message.dispatchId, message.phone, {
      status: "enviado",
      error: null,
      checkedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    await patchRecipientStatus(message.dispatchId, message.phone, {
      status: "falha_envio",
      error: error instanceof Error ? error.message : "Falha ao enviar mensagem.",
      checkedAt: new Date().toISOString(),
    });
  }
}

async function patchRecipientStatus(
  dispatchId: string,
  phone: string,
  patch: Partial<Omit<BroadcastRecipientStatus, "phone">>,
) {
  const history = await readBroadcastHistory();
  const nextHistory = history.map((dispatch) => {
    if (dispatch.id !== dispatchId) return dispatch;
    const recipientStatuses = dispatch.recipientStatuses.map((item) =>
      item.phone === phone ? { ...item, ...patch } : item,
    );
    const summary = summarizeStatuses(recipientStatuses);
    return {
      ...dispatch,
      status: resolveDispatchStatus(summary),
      sent: summary.enviado,
      failed: summary.falhaEnvio + summary.falhaValidacao,
      recipientStatuses,
      updatedAt: new Date().toISOString(),
    };
  });
  await writeBroadcastHistory(nextHistory);
}

async function findBroadcastDispatch(id: string) {
  return (await readBroadcastHistory()).find((dispatch) => dispatch.id === id) ?? null;
}

async function readBroadcastHistory() {
  const setting = await prisma.appSetting.findUnique({ where: { key: BROADCAST_HISTORY_KEY } });
  return normalizeBroadcastHistory(setting?.value);
}

async function writeBroadcastHistory(history: BroadcastDispatchRecord[]) {
  await prisma.appSetting.upsert({
    where: { key: BROADCAST_HISTORY_KEY },
    create: { key: BROADCAST_HISTORY_KEY, value: normalizeJson(history) },
    update: { value: normalizeJson(history) },
  });
}

function normalizeBroadcastHistory(value: unknown): BroadcastDispatchRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const id = String(entry.id ?? "").trim();
    if (!id) return [];
    return [{
      id,
      batchId: String(entry.batchId ?? id),
      title: String(entry.title ?? "Disparo em lote"),
      message: String(entry.message ?? ""),
      media: typeof entry.media === "string" ? entry.media : undefined,
      mediaKind: entry.mediaKind === "imagem" ? "imagem" : undefined,
      mimeType: typeof entry.mimeType === "string" ? entry.mimeType : undefined,
      fileName: typeof entry.fileName === "string" ? entry.fileName : undefined,
      status: String(entry.status ?? "agendado"),
      ownerUserId: typeof entry.ownerUserId === "string" ? entry.ownerUserId : undefined,
      total: Number(entry.total ?? 0),
      sent: Number(entry.sent ?? 0),
      failed: Number(entry.failed ?? 0),
      invalid: Number(entry.invalid ?? 0),
      duplicate: Number(entry.duplicate ?? 0),
      recipientStatuses: normalizeRecipientStatuses(entry.recipientStatuses),
      createdAt: String(entry.createdAt ?? new Date().toISOString()),
      updatedAt: String(entry.updatedAt ?? entry.createdAt ?? new Date().toISOString()),
      metadata: entry.metadata && typeof entry.metadata === "object" ? entry.metadata as Record<string, unknown> : {},
    }];
  });
}

function normalizeRecipientStatuses(value: unknown): BroadcastRecipientStatus[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const phone = String(entry.phone ?? "").trim();
    if (!phone) return [];
    return [{
      phone,
      status: normalizeBroadcastStatus(entry.status),
      error: typeof entry.error === "string" ? entry.error : null,
      checkedAt: typeof entry.checkedAt === "string" ? entry.checkedAt : null,
      sentAt: typeof entry.sentAt === "string" ? entry.sentAt : null,
      scheduledFor: typeof entry.scheduledFor === "string" ? entry.scheduledFor : null,
      blockLabel: typeof entry.blockLabel === "string" ? entry.blockLabel : null,
    }];
  });
}

function normalizeBroadcastStatus(value: unknown): BroadcastRecipientStatus["status"] {
  if (
    value === "agendado" ||
    value === "processando" ||
    value === "enviado" ||
    value === "sem_whatsapp" ||
    value === "falha_validacao" ||
    value === "falha_envio" ||
    value === "auto_pausado" ||
    value === "cancelado"
  ) {
    return value;
  }
  return "agendado";
}

function summarizeStatuses(entries: BroadcastRecipientStatus[]) {
  return entries.reduce((summary, item) => {
    if (item.status === "agendado") summary.agendado += 1;
    if (item.status === "processando") summary.processando += 1;
    if (item.status === "enviado") summary.enviado += 1;
    if (item.status === "sem_whatsapp") summary.semWhatsapp += 1;
    if (item.status === "falha_validacao") summary.falhaValidacao += 1;
    if (item.status === "falha_envio") summary.falhaEnvio += 1;
    if (item.status === "auto_pausado") summary.autoPausado += 1;
    if (item.status === "cancelado") summary.cancelado += 1;
    return summary;
  }, {
    agendado: 0,
    processando: 0,
    enviado: 0,
    semWhatsapp: 0,
    falhaValidacao: 0,
    falhaEnvio: 0,
    autoPausado: 0,
    cancelado: 0,
  });
}

function resolveDispatchStatus(summary: ReturnType<typeof summarizeStatuses>) {
  if (summary.cancelado > 0 && summary.agendado === 0 && summary.processando === 0) return "cancelado";
  if (summary.autoPausado > 0 && summary.agendado > 0) return "auto_pausado";
  if (summary.agendado > 0 || summary.processando > 0) return "agendado";
  if (summary.enviado > 0 && (summary.semWhatsapp > 0 || summary.falhaEnvio > 0 || summary.falhaValidacao > 0 || summary.autoPausado > 0)) return "concluido_parcial";
  if (summary.enviado > 0) return "concluido";
  return "concluido_sem_envios";
}

async function findOrCreateBroadcastConversation(input: { phone: string; ownerUserId?: string }) {
  const existing = await prisma.chatConversation.findFirst({
    where: { phone: input.phone, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  return prisma.chatConversation.create({
    data: {
      phone: input.phone,
      state: "START",
      ownerUserId: input.ownerUserId,
      memory: {
        contactName: input.phone,
        assignedTo: "Equipe",
        tags: ["Disparo em lote"],
        source: "broadcast",
        whatsapp: input.phone,
      },
    },
  });
}

function buildRecipientSchedule(phones: string[], blocks: BroadcastScheduleBlock[], sendNow = false) {
  const normalizedBlocks = blocks
    .map((block) => ({
      time: normalizeTime(block.time),
      quantity: Math.max(0, Math.floor(Number(block.quantity) || 0)),
    }))
    .filter((block) => block.time && block.quantity > 0);
  if (sendNow) {
    return buildImmediateRecipientSchedule(phones);
  }

  const fallbackBlocks = normalizedBlocks.length ? normalizedBlocks : [{ time: currentBrazilTime(), quantity: phones.length }];
  const scheduled: Array<{ phone: string; scheduledFor: string; blockLabel: string }> = [];
  let cursor = 0;

  for (const block of fallbackBlocks) {
    const startAt = nextBrazilScheduleDate(block.time);
    let previousAt = new Date(startAt);
    for (let index = 0; index < block.quantity && cursor < phones.length; index += 1) {
      const scheduledAt = index === 0
        ? new Date(startAt)
        : new Date(previousAt.getTime() + randomBroadcastDelaySeconds() * 1000);
      scheduled.push({
        phone: phones[cursor],
        scheduledFor: scheduledAt.toISOString(),
        blockLabel: `${block.time} · ${block.quantity}`,
      });
      previousAt = scheduledAt;
      cursor += 1;
    }
  }

  while (cursor < phones.length) {
    const lastAt = scheduled.length ? new Date(scheduled[scheduled.length - 1].scheduledFor) : new Date();
    const scheduledAt = new Date(lastAt.getTime() + randomBroadcastDelaySeconds() * 1000);
    scheduled.push({
      phone: phones[cursor],
      scheduledFor: scheduledAt.toISOString(),
      blockLabel: "Extra",
    });
    cursor += 1;
  }

  return scheduled;
}

function buildImmediateRecipientSchedule(phones: string[]) {
  const scheduled: Array<{ phone: string; scheduledFor: string; blockLabel: string }> = [];
  let previousAt = new Date();
  for (const [index, phone] of phones.entries()) {
    const scheduledAt = index === 0
      ? new Date(previousAt)
      : new Date(previousAt.getTime() + randomBroadcastDelaySeconds() * 1000);
    scheduled.push({
      phone,
      scheduledFor: scheduledAt.toISOString(),
      blockLabel: "Agora",
    });
    previousAt = scheduledAt;
  }
  return scheduled;
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function nextBrazilScheduleDate(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value ?? new Date().getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);
  let date = new Date(Date.UTC(year, month - 1, day, hours + 3, minutes, 0, 0));
  if (date.getTime() < Date.now() - 60_000) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  }
  return date;
}

function currentBrazilTime() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function randomBroadcastDelaySeconds() {
  return WHATSAPP_BROADCAST_MIN_DELAY_SECONDS +
    Math.floor(Math.random() * (WHATSAPP_BROADCAST_MAX_DELAY_SECONDS - WHATSAPP_BROADCAST_MIN_DELAY_SECONDS + 1));
}

function resolveEvolutionMessageId(result: unknown) {
  if (!result || typeof result !== "object") return undefined;
  const payload = result as { key?: { id?: unknown }; message?: { key?: unknown }; messageId?: unknown; id?: unknown };
  if (typeof payload.key?.id === "string" && payload.key.id.trim()) return payload.key.id.trim();
  const messageKey = payload.message?.key;
  if (messageKey && typeof messageKey === "object" && "id" in messageKey && typeof messageKey.id === "string" && messageKey.id.trim()) {
    return messageKey.id.trim();
  }
  if (typeof payload.messageId === "string" && payload.messageId.trim()) return payload.messageId.trim();
  if (typeof payload.id === "string" && payload.id.trim()) return payload.id.trim();
  return undefined;
}

function normalizeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
