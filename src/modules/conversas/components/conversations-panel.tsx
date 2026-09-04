"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Download, FileText, MessageCircle, Phone, Plus, RefreshCw, Send, Tag, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResult } from "@/types/api";

type ChatMessage = {
  id: string;
  direction: string;
  body: string;
  providerId: string | null;
  createdAt: string;
  readAt: string | null;
  sentAt: string | null;
  rawPayload?: unknown;
};

type ChatConversation = {
  id: string;
  phone: string;
  state: string;
  memory: Record<string, unknown>;
  lead: { name: string } | null;
  agent: { name: string } | null;
  owner: { name: string } | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

type NewConversationState = {
  name: string;
  phone: string;
  bulkMode: boolean;
  phones: string;
  bulkMessage: string;
  bulkImage: string;
  bulkImageName: string;
  bulkImageMimeType: string;
  sendNow: boolean;
  scheduleBlocks: ScheduleBlock[];
};

type ScheduleBlock = {
  id: string;
  time: string;
  quantity: string;
};

const emptyNewConversation: NewConversationState = {
  name: "",
  phone: "",
  bulkMode: false,
  phones: "",
  bulkMessage: "",
  bulkImage: "",
  bulkImageName: "",
  bulkImageMimeType: "",
  sendNow: false,
  scheduleBlocks: [
    { id: "slot-0900", time: "09:00", quantity: "25" },
    { id: "slot-1010", time: "10:10", quantity: "30" },
    { id: "slot-1130", time: "11:30", quantity: "20" },
    { id: "slot-1320", time: "13:20", quantity: "30" },
    { id: "slot-1440", time: "14:40", quantity: "25" },
    { id: "slot-1610", time: "16:10", quantity: "30" },
    { id: "slot-1730", time: "17:30", quantity: "20" },
    { id: "slot-1900", time: "19:00", quantity: "25" },
  ],
};

type BroadcastDispatch = {
  id: string;
  batchId: string;
  title: string;
  message: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  invalid: number;
  duplicate: number;
  recipientStatuses: Array<{
    phone: string;
    status: string;
    error: string | null;
    checkedAt: string | null;
    sentAt: string | null;
    scheduledFor: string | null;
    blockLabel: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export function ConversationsPanel() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [newConversation, setNewConversation] = useState(emptyNewConversation);
  const [message, setMessage] = useState("");
  const [newTag, setNewTag] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<BroadcastDispatch[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [submittingConversation, setSubmittingConversation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? conversations[0],
    [activeId, conversations],
  );
  const activeTags = useMemo(() => getConversationTags(active), [active]);
  const activeBlocked = isConversationBlocked(active);
  const availableTags = useMemo(() => {
    return Array.from(new Set(conversations.flatMap((conversation) => getConversationTags(conversation)))).sort((a, b) => a.localeCompare(b));
  }, [conversations]);
  const bulkPhoneCount = useMemo(() => countBulkPhones(newConversation.phones), [newConversation.phones]);
  const scheduledQuantity = useMemo(() => newConversation.sendNow ? bulkPhoneCount : sumScheduleQuantity(newConversation.scheduleBlocks), [bulkPhoneCount, newConversation.scheduleBlocks, newConversation.sendNow]);
  const remainingToSchedule = bulkPhoneCount - scheduledQuantity;

  async function refreshConversations(nextActiveId?: string) {
    setError("");
    setRefreshing(true);
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const result = await response.json() as ApiResult<ChatConversation[]>;
    if (result.status !== "success") {
      setError(result.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setConversations((current) => mergeConversations(result.data, current));
    setActiveId((current) => {
      const preferredId = nextActiveId ?? current;
      if (preferredId && result.data.some((conversation) => conversation.id === preferredId)) return preferredId;
      return result.data[0]?.id ?? "";
    });
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void refreshConversations();
  }, []);

  useEffect(() => {
    if (!createModalOpen && !historyModalOpen) return;
    void refreshBroadcastHistory();
    const interval = window.setInterval(() => void refreshBroadcastHistory(), 5000);
    return () => window.clearInterval(interval);
  }, [createModalOpen, historyModalOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.id, active?.messages.length]);

  async function handleCreateConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingConversation) return;
    setError("");
    setSubmittingConversation(true);

    if (newConversation.bulkMode) {
      const response = await fetch("/api/whatsapp/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phones: newConversation.phones,
          message: newConversation.bulkMessage,
          media: newConversation.bulkImage,
          mimeType: newConversation.bulkImageMimeType,
          fileName: newConversation.bulkImageName,
          sendNow: newConversation.sendNow,
          scheduleBlocks: newConversation.scheduleBlocks.map((block) => ({
            time: block.time,
            quantity: Number(block.quantity) || 0,
          })),
        }),
      });
      const result = await response.json() as ApiResult<{ id: string }>;
      setSubmittingConversation(false);
      if (result.status !== "success") {
        setError(result.message);
        return;
      }

      setNewConversation(emptyNewConversation);
      setCreateModalOpen(false);
      setHistoryModalOpen(true);
      await refreshBroadcastHistory();
      await refreshConversations();
      return;
    }

    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConversation),
    });
    const result = await response.json() as ApiResult<ChatConversation>;
    setSubmittingConversation(false);
    if (result.status !== "success") {
      setError(result.message);
      return;
    }

    setNewConversation(emptyNewConversation);
    setCreateModalOpen(false);
    await refreshConversations(result.data.id);
  }

  async function refreshBroadcastHistory() {
    const response = await fetch("/api/whatsapp/broadcast", { cache: "no-store" });
    const result = await response.json() as ApiResult<BroadcastDispatch[]>;
    if (result.status === "success") {
      setBroadcastHistory(result.data);
    }
  }

  async function handleBulkFileChange(file?: File | null) {
    if (!file) return;
    setError("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "csv" || file.type.includes("csv")) {
        const text = await file.text();
        setNewConversation((current) => ({ ...current, phones: mergePhoneText(current.phones, text) }));
        return;
      }

      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
      const extracted = extractPhoneTextFromRows(rows);
      setNewConversation((current) => ({ ...current, phones: mergePhoneText(current.phones, extracted) }));
    } catch {
      setError("Nao foi possivel ler a planilha. Use .xlsx, .xls ou .csv.");
    }
  }

  async function handleBulkImageChange(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem valida para o disparo.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setNewConversation((current) => ({
      ...current,
      bulkImage: dataUrl,
      bulkImageName: file.name,
      bulkImageMimeType: file.type,
    }));
  }

  async function deleteHistory(ids?: string[]) {
    if (ids?.length && !window.confirm(`Excluir ${ids.length} registro(s) do historico? As conversas nao serao apagadas.`)) return;
    if (!ids?.length && !window.confirm("Excluir todo o historico de disparos? As conversas nao serao apagadas.")) return;
    const response = await fetch(ids?.length ? "/api/whatsapp/broadcast" : "/api/whatsapp/broadcast?all=1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: ids?.length ? JSON.stringify({ ids }) : undefined,
    });
    const result = await response.json() as ApiResult<{ deleted: number }>;
    if (result.status !== "success") {
      setError(result.message);
      return;
    }
    setSelectedHistoryIds([]);
    await refreshBroadcastHistory();
  }

  async function cancelHistory(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(`Cancelar ${ids.length} agendamento(s)? Mensagens ja enviadas nao serao apagadas.`)) return;
    const response = await fetch("/api/whatsapp/broadcast", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", ids }),
    });
    const result = await response.json() as ApiResult<{ canceled: number }>;
    if (result.status !== "success") {
      setError(result.message);
      return;
    }
    setSelectedHistoryIds([]);
    await refreshBroadcastHistory();
  }

  function updateScheduleBlock(id: string, patch: Partial<ScheduleBlock>) {
    setNewConversation((current) => ({
      ...current,
      scheduleBlocks: current.scheduleBlocks.map((block) => block.id === id ? { ...block, ...patch } : block),
    }));
  }

  function addScheduleBlock() {
    setNewConversation((current) => ({
      ...current,
      scheduleBlocks: [...current.scheduleBlocks, { id: `slot-${Date.now()}`, time: "09:00", quantity: "20" }],
    }));
  }

  function removeScheduleBlock(id: string) {
    setNewConversation((current) => ({
      ...current,
      scheduleBlocks: current.scheduleBlocks.filter((block) => block.id !== id),
    }));
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || activeBlocked || !message.trim() || sending) return;
    setSending(true);
    setError("");
    const outgoingText = message.trim();
    const tempId = `local-${Date.now()}`;
    setMessage("");
    setConversations((current) => addLocalMessage(current, active.id, {
      id: tempId,
      direction: "outbound",
      body: outgoingText,
      providerId: null,
      createdAt: new Date().toISOString(),
      readAt: null,
      sentAt: null,
      rawPayload: { status: "pendente" },
    }));

    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: active.phone,
        message: outgoingText,
        conversationId: active.id,
        contactName: getConversationName(active),
      }),
    });
    const result = await response.json() as ApiResult<{ conversationId: string }>;
    if (result.status !== "success") {
      setError(result.message);
      setConversations((current) => markLocalMessageFailed(current, tempId));
      setSending(false);
      return;
    }

    await refreshConversations(result.data.conversationId);
    setSending(false);
  }

  async function updateActiveTags(tags: string[]) {
    if (!active) return;
    const normalizedTags = normalizeTags(tags);
    setConversations((current) => current.map((conversation) =>
      conversation.id === active.id
        ? { ...conversation, memory: { ...conversation.memory, tags: normalizedTags } }
        : conversation,
    ));
    const response = await fetch("/api/conversations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, tags: normalizedTags }),
    });
    const result = await response.json() as ApiResult<ChatConversation>;
    if (result.status !== "success") {
      setError(result.message);
      await refreshConversations(active.id);
      return;
    }
    setConversations((current) => mergeConversations([result.data], current));
  }

  async function handleCreateTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !newTag.trim()) return;
    await updateActiveTags([...activeTags, newTag]);
    setNewTag("");
  }

  async function toggleActiveBlocked() {
    if (!active) return;
    const nextBlocked = !activeBlocked;
    if (nextBlocked && !window.confirm(`Bloquear ${getConversationName(active)}? As novas mensagens desse número serão ignoradas.`)) return;
    const previousState = typeof active.memory?.previousState === "string" ? active.memory.previousState : undefined;
    const nextState = nextBlocked ? "BLOCKED" : previousState ?? "MANUAL";

    setConversations((current) => current.map((conversation) =>
      conversation.id === active.id
        ? {
            ...conversation,
            state: nextState,
            memory: {
              ...conversation.memory,
              blocked: nextBlocked,
              previousState: nextBlocked ? conversation.state : previousState,
            },
          }
        : conversation,
    ));

    const response = await fetch("/api/conversations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, blocked: nextBlocked }),
    });
    const result = await response.json() as ApiResult<ChatConversation>;
    if (result.status !== "success") {
      setError(result.message);
      await refreshConversations(active.id);
      return;
    }
    setConversations((current) => mergeConversations([result.data], current));
  }

  async function handleDeleteConversation() {
    if (!active || !window.confirm(`Excluir conversa de ${getConversationName(active)}?`)) return;
    setError("");
    const deletedId = active.id;
    const response = await fetch(`/api/conversations?id=${encodeURIComponent(deletedId)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const result = await response.json() as ApiResult<{ id: string }>;
    if (result.status !== "success") {
      setError(result.message);
      return;
    }
    setConversations((current) => current.filter((conversation) => conversation.id !== deletedId));
    setActiveId((current) => current === deletedId ? "" : current);
    await refreshConversations();
  }

  return (
    <div className="grid h-[calc(100vh-8rem)] min-h-[36rem] gap-4 overflow-hidden lg:grid-cols-[360px_1fr]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Conversas</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {refreshing && !loading ? "Atualizando em tempo real..." : "Mensagens em tempo real"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" type="button" onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Chamar novo número
              </Button>
              <Button size="icon" variant="ghost" type="button" onClick={() => void refreshConversations()} aria-label="Atualizar conversas">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          {error ? <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-600">{error}</p> : null}

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando conversas</p>
            ) : conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveId(conversation.id)}
                  className={`w-full rounded-xl border p-3 text-left transition hover:bg-blue-500/10 ${conversation.id === active?.id ? "border-primary/70 bg-primary/15" : "border-blue-400/15 bg-blue-500/5"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{getConversationName(conversation)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {conversation.phone}
                      </p>
                      {isConversationBlocked(conversation) ? <p className="mt-1 text-xs font-medium text-red-600">Contato bloqueado</p> : null}
                    </div>
                    <TagList tags={getConversationTags(conversation)} compact />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {getLastMessage(conversation)?.body ?? "Sem mensagens ainda"}
                  </p>
                </button>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Nenhuma conversa registrada
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        {active ? (
          <>
            <CardHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{getConversationName(active)}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {active.phone} · {active.agent?.name ?? getAssignedTo(active)}
                  </p>
                  <div className="mt-3">
                    <TagList tags={activeTags} onRemove={(tag) => void updateActiveTags(activeTags.filter((item) => item !== tag))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant={activeBlocked ? "outline" : "secondary"} size="sm" type="button" onClick={() => void toggleActiveBlocked()}>
                    <Ban className="h-4 w-4 text-red-500" />
                    {activeBlocked ? "Desbloquear" : "Bloquear"}
                  </Button>
                  <Button variant="destructive" size="sm" type="button" onClick={() => void handleDeleteConversation()} aria-label="Apagar conversa">
                    <Trash2 className="h-4 w-4" />
                    Apagar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              {activeBlocked ? (
                <div className="border-b bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">
                  Este contato está bloqueado. Novas mensagens recebidas desse número serão ignoradas.
                </div>
              ) : null}
              <div className="border-b border-blue-400/15 bg-[#02142d]/55 p-3">
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleCreateTag}>
                  <Input
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    placeholder="Criar etiqueta"
                  />
                  <Button type="submit" variant="outline" disabled={!newTag.trim()}>
                    <Tag className="h-4 w-4" />
                    Criar/aplicar
                  </Button>
                </form>
                {availableTags.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {availableTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => void updateActiveTags(activeTags.includes(tag) ? activeTags.filter((item) => item !== tag) : [...activeTags, tag])}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${activeTags.includes(tag) ? "border-primary bg-primary text-primary-foreground" : "border-blue-400/15 bg-blue-500/5 text-muted-foreground"}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#010b19]/55 p-4 pr-2">
                {active.messages.length ? (
                  active.messages.map((item) => {
                    const media = getMessageMedia(item);
                    return (
                      <div key={item.id} className={`flex ${item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-2xl border px-3 py-2 text-sm shadow-sm ${item.direction === "outbound" ? "border-blue-500/45 bg-[#0757b8] text-white" : "border-blue-400/15 bg-blue-500/10 text-slate-100"}`}>
                          {media ? <MessageMediaPreview media={media} /> : null}
                          {shouldShowMessageText(item, media) ? <p className="whitespace-pre-wrap">{item.body}</p> : null}
                          <p className={`mt-1 text-[11px] ${item.direction === "outbound" ? "text-blue-100/75" : "text-slate-400"}`}>
                            {formatDate(item.createdAt)}{isPendingLocalMessage(item) ? " · enviando" : ""}{isFailedLocalMessage(item) ? " · falha" : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-blue-400/20 bg-blue-500/5 p-6 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Envie uma mensagem para iniciar.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="border-t border-blue-400/15 bg-[#02142d]/55 p-4" onSubmit={handleSendMessage}>
                <div className="flex gap-3">
                  <Textarea
                    className="min-h-12 resize-none"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={activeBlocked ? "Contato bloqueado" : "Digite uma mensagem"}
                    disabled={activeBlocked}
                  />
                  <Button className="h-auto px-5" type="submit" disabled={activeBlocked || sending || !message.trim()}>
                    <Send className="h-4 w-4" />
                    {sending ? "Enviando" : "Enviar"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        ) : (
          <CardContent className="flex min-h-[32rem] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10" />
            <p className="text-sm">Selecione ou inicie uma conversa.</p>
          </CardContent>
        )}
      </Card>
      {createModalOpen ? (
        <Modal title="Chamar novo número" onClose={() => setCreateModalOpen(false)}>
          <form className="space-y-3" onSubmit={handleCreateConversation}>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-blue-400/15 bg-blue-500/5 p-1">
              <button
                type="button"
                onClick={() => setNewConversation((current) => ({ ...current, bulkMode: false }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${!newConversation.bulkMode ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-blue-500/10"}`}
              >
                Unitário
              </button>
              <button
                type="button"
                onClick={() => setNewConversation((current) => ({ ...current, bulkMode: true }))}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${newConversation.bulkMode ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-blue-500/10"}`}
              >
                Disparo em lote
              </button>
            </div>

            {newConversation.bulkMode ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-400/15 bg-blue-500/5 p-3">
                  <div>
                    <p className="text-sm font-semibold">Disparo em lote</p>
                    <p className="text-xs text-muted-foreground">Importe planilha, cole números, anexe imagem e escolha disparar agora ou agendar.</p>
                  </div>
                  <Button size="sm" variant="outline" type="button" onClick={() => setHistoryModalOpen(true)}>
                    Histórico
                  </Button>
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-400/30 bg-blue-500/5 p-4 text-sm font-medium text-blue-100 transition hover:bg-blue-500/10">
                  <Upload className="h-4 w-4" />
                  Subir planilha .xlsx, .xls ou .csv
                  <input
                    className="hidden"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(event) => void handleBulkFileChange(event.target.files?.[0])}
                  />
                </label>
                <Textarea
                  className="min-h-32"
                  value={newConversation.phones}
                  onChange={(event) => setNewConversation((current) => ({ ...current, phones: event.target.value }))}
                  placeholder={"Ou cole aqui:\n5511978140022\n5511999999999\nUm número por linha"}
                  required
                />
                <Textarea
                  className="min-h-28"
                  value={newConversation.bulkMessage}
                  onChange={(event) => setNewConversation((current) => ({ ...current, bulkMessage: event.target.value }))}
                  placeholder="Mensagem do disparo"
                  required
                />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-400/30 bg-blue-500/5 p-4 text-sm font-medium text-blue-100 transition hover:bg-blue-500/10">
                  <Upload className="h-4 w-4" />
                  {newConversation.bulkImageName ? `Imagem selecionada: ${newConversation.bulkImageName}` : "Enviar imagem do disparo"}
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleBulkImageChange(event.target.files?.[0])}
                  />
                </label>
                {newConversation.bulkImage ? (
                  <div className="rounded-xl border border-blue-400/15 bg-slate-950/40 p-2">
                    <img src={newConversation.bulkImage} alt="Imagem do disparo" className="max-h-48 w-full rounded-lg object-contain" />
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => setNewConversation((current) => ({ ...current, bulkImage: "", bulkImageName: "", bulkImageMimeType: "" }))}
                    >
                      Remover imagem
                    </Button>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 rounded-xl border border-blue-400/15 bg-blue-500/5 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={newConversation.sendNow}
                    onChange={(event) => setNewConversation((current) => ({ ...current, sendNow: event.target.checked }))}
                  />
                  Disparar na hora, mantendo intervalo aleatório entre cada número
                </label>
                <div className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Agenda dos disparos</p>
                      <p className="text-xs text-muted-foreground">
                        {newConversation.sendNow ? "Desative “Disparar na hora” para programar horários." : "Cada bloco usa a mesma lista e envia um por um com intervalo aleatório."}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" type="button" onClick={addScheduleBlock} disabled={newConversation.sendNow}>
                      <Plus className="h-3.5 w-3.5" />
                      Bloco
                    </Button>
                  </div>
                  <div className={`space-y-2 ${newConversation.sendNow ? "pointer-events-none opacity-50" : ""}`}>
                    {newConversation.scheduleBlocks.map((block, index) => (
                      <div key={block.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <Input
                          type="time"
                          value={block.time}
                          onChange={(event) => updateScheduleBlock(block.id, { time: event.target.value })}
                          aria-label={`Horario do bloco ${index + 1}`}
                        />
                        <Input
                          inputMode="numeric"
                          value={block.quantity}
                          onChange={(event) => updateScheduleBlock(block.id, { quantity: event.target.value.replace(/\D/g, "") })}
                          placeholder="Qtd."
                          aria-label={`Quantidade do bloco ${index + 1}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          onClick={() => removeScheduleBlock(block.id)}
                          disabled={newConversation.scheduleBlocks.length === 1}
                          aria-label="Remover bloco"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <p className="rounded-lg bg-slate-950/40 p-2">Contatos: <span className="font-semibold text-slate-100">{bulkPhoneCount}</span></p>
                    <p className="rounded-lg bg-slate-950/40 p-2">Programados: <span className="font-semibold text-slate-100">{scheduledQuantity}</span></p>
                    <p className={`rounded-lg p-2 ${remainingToSchedule === 0 ? "bg-emerald-500/10 text-emerald-200" : remainingToSchedule > 0 ? "bg-amber-500/10 text-amber-200" : "bg-red-500/10 text-red-200"}`}>
                      {remainingToSchedule === 0 ? "Fechou certinho" : remainingToSchedule > 0 ? `Sobra: ${remainingToSchedule}` : `Excedeu: ${Math.abs(remainingToSchedule)}`}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O cron da Vercel processa automaticamente os horários. Dentro de cada bloco, os números saem entre 60 e 140 segundos por padrão.
                </p>
              </>
            ) : (
              <>
                <Input
                  value={newConversation.name}
                  onChange={(event) => setNewConversation((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Nome do contato"
                />
                <Input
                  value={newConversation.phone}
                  onChange={(event) => setNewConversation((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="+5511999999999"
                  required={!newConversation.bulkMode}
                />
              </>
            )}
            <Button className="w-full" type="submit">
              <Phone className="h-4 w-4" />
              {submittingConversation ? "Processando..." : newConversation.bulkMode ? newConversation.sendNow ? "Disparar agora" : "Agendar disparo" : "Iniciar conversa"}
            </Button>
          </form>
        </Modal>
      ) : null}
      {historyModalOpen ? (
        <Modal title="Histórico de disparos" onClose={() => setHistoryModalOpen(false)}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Histórico separado das conversas. Excluir aqui não apaga nenhuma conversa.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" type="button" onClick={() => void refreshBroadcastHistory()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </Button>
                <Button size="sm" variant="outline" type="button" disabled={!selectedHistoryIds.length} onClick={() => void cancelHistory(selectedHistoryIds)}>
                  Cancelar selecionados
                </Button>
                <Button size="sm" variant="destructive" type="button" disabled={!selectedHistoryIds.length} onClick={() => void deleteHistory(selectedHistoryIds)}>
                  Apagar selecionados
                </Button>
                <Button size="sm" variant="destructive" type="button" disabled={!broadcastHistory.length} onClick={() => void deleteHistory()}>
                  Apagar tudo
                </Button>
              </div>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {broadcastHistory.length ? broadcastHistory.map((item) => (
                <div key={item.id} className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3 text-xs">
                  <div className="flex items-start gap-3">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={selectedHistoryIds.includes(item.id)}
                      onChange={(event) => setSelectedHistoryIds((current) =>
                        event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                      )}
                      aria-label={`Selecionar ${item.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-sm">{item.title}</p>
                          <p className="mt-1 text-muted-foreground">{formatDate(item.createdAt)} · {formatBroadcastStatus(item.status)}</p>
                        </div>
                        <span className="rounded-full bg-blue-500/15 px-2 py-1 font-semibold text-blue-200">
                          {item.sent}/{Math.max(0, item.total - item.invalid - item.duplicate)}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-muted-foreground">{item.message || "Disparo com imagem"}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-950">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${getBroadcastProgress(item)}%` }} />
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        Enviados: {item.sent} · Ignorados sem WhatsApp: {countBroadcastRecipientsByStatus(item, "sem_whatsapp")} · Falhas: {item.failed} · Inválidos: {item.invalid} · Duplicados: {item.duplicate}
                      </p>
                      {item.recipientStatuses?.length ? (
                        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-slate-950/40 p-2">
                          {item.recipientStatuses.map((recipient) => (
                            <p key={`${item.id}-${recipient.phone}`} className="flex justify-between gap-2 py-0.5">
                              <span>{recipient.phone}</span>
                              <span className="text-right">
                                {formatBroadcastStatus(recipient.status)}{recipient.scheduledFor ? ` · ${formatDate(recipient.scheduledFor)}` : ""}
                              </span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )) : (
                <p className="rounded-xl border border-dashed border-blue-400/20 p-6 text-center text-sm text-muted-foreground">
                  Nenhum disparo registrado ainda.
                </p>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function getConversationName(conversation: ChatConversation) {
  return String(conversation.memory?.contactName ?? conversation.lead?.name ?? conversation.phone);
}

function getAssignedTo(conversation: ChatConversation) {
  return String(conversation.memory?.assignedTo ?? conversation.owner?.name ?? "Equipe");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getLastMessage(conversation: ChatConversation) {
  return [...conversation.messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).at(-1);
}

type MessageMedia = {
  kind: "imagem" | "audio" | "video" | "documento";
  url: string;
  fileName: string;
  mimeType: string;
};

function getMessageMedia(message: ChatMessage): MessageMedia | null {
  if (!message.rawPayload || typeof message.rawPayload !== "object" || Array.isArray(message.rawPayload)) return null;
  const payload = message.rawPayload as Record<string, unknown>;
  const nestedMedia = payload.media && typeof payload.media === "object" && !Array.isArray(payload.media)
    ? payload.media as Record<string, unknown>
    : {};
  const raw = payload.raw && typeof payload.raw === "object" && !Array.isArray(payload.raw)
    ? payload.raw as Record<string, unknown>
    : {};
  const data = raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
    ? raw.data as Record<string, unknown>
    : raw;
  const webhookMessage = data.message && typeof data.message === "object" && !Array.isArray(data.message)
    ? data.message as Record<string, unknown>
    : {};
  const imageMessage = webhookMessage.imageMessage && typeof webhookMessage.imageMessage === "object" && !Array.isArray(webhookMessage.imageMessage)
    ? webhookMessage.imageMessage as Record<string, unknown>
    : {};
  const audioMessage = webhookMessage.audioMessage && typeof webhookMessage.audioMessage === "object" && !Array.isArray(webhookMessage.audioMessage)
    ? webhookMessage.audioMessage as Record<string, unknown>
    : {};
  const videoMessage = webhookMessage.videoMessage && typeof webhookMessage.videoMessage === "object" && !Array.isArray(webhookMessage.videoMessage)
    ? webhookMessage.videoMessage as Record<string, unknown>
    : {};
  const documentMessage = webhookMessage.documentMessage && typeof webhookMessage.documentMessage === "object" && !Array.isArray(webhookMessage.documentMessage)
    ? webhookMessage.documentMessage as Record<string, unknown>
    : {};
  const candidates = [payload, nestedMedia, data, webhookMessage, imageMessage, audioMessage, videoMessage, documentMessage];
  const source = firstPayloadString(candidates.flatMap((item) => [
    item.mediaUrl,
    item.url,
    item.imageUrl,
    item.audioUrl,
    item.videoUrl,
    item.documentUrl,
    item.base64,
    item.data,
    item.directPath,
  ]));
  const mimeType = firstPayloadString(candidates.flatMap((item) => [item.mimeType, item.mimetype]));
  const kind = normalizeMessageKind(payload.kind || data.messageType, mimeType, source);
  if (!source && kind === "texto") return null;
  const fileName = firstPayloadString(candidates.flatMap((item) => [item.fileName, item.filename, item.title])) || fileNameForKind(kind);
  const url = source?.startsWith("data:") || source?.startsWith("blob:")
    ? source
    : `/api/conversations/messages/${encodeURIComponent(message.id)}/media`;

  return {
    kind: kind === "texto" ? "documento" : kind,
    url,
    fileName,
    mimeType: mimeType || mimeTypeForKind(kind),
  };
}

function shouldShowMessageText(message: ChatMessage, media: MessageMedia | null) {
  if (!media) return true;
  const normalized = message.body.trim().toLowerCase();
  if (!normalized) return false;
  return !["imagem recebida", "áudio recebido", "audio recebido", "video recebido", "documento recebido", "imagem", "audio", "áudio", "video", "documento"].includes(normalized);
}

function MessageMediaPreview({ media }: { media: MessageMedia }) {
  const openLabel = media.kind === "imagem" ? "Abrir imagem" : media.kind === "audio" ? "Abrir áudio" : media.kind === "video" ? "Abrir vídeo" : "Abrir documento";
  return (
    <div className="mb-2 space-y-2">
      {media.kind === "imagem" ? (
        <a href={media.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-blue-300/20 bg-slate-950/30">
          <img src={media.url} alt={media.fileName} className="max-h-80 w-full object-contain" />
        </a>
      ) : media.kind === "audio" ? (
        <audio controls preload="none" className="max-w-full" src={media.url}>
          Seu navegador nao suporta reproducao de audio.
        </audio>
      ) : media.kind === "video" ? (
        <video controls preload="metadata" className="max-h-80 w-full rounded-xl" src={media.url}>
          Seu navegador nao suporta reproducao de video.
        </video>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-blue-300/20 bg-slate-950/30 p-3">
          <FileText className="h-5 w-5" />
          <span className="truncate text-sm">{media.fileName}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        <a className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/15" href={media.url} target="_blank" rel="noreferrer">
          {openLabel}
        </a>
        <a className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/15" href={media.url} download={media.fileName}>
          <Download className="h-3 w-3" />
          Baixar
        </a>
      </div>
    </div>
  );
}

function normalizeMessageKind(kind: unknown, mimeType?: unknown, mediaUrl?: unknown): "texto" | "imagem" | "audio" | "video" | "documento" {
  const normalizedKind = String(kind ?? "").trim().toLowerCase();
  if (normalizedKind === "imagem" || normalizedKind === "image") return "imagem";
  if (normalizedKind === "audio" || normalizedKind === "ptt" || normalizedKind === "voice") return "audio";
  if (normalizedKind === "video" || normalizedKind === "vídeo") return "video";
  if (normalizedKind === "documento" || normalizedKind === "document" || normalizedKind === "file" || normalizedKind === "arquivo") return "documento";

  const normalizedMimeType = String(mimeType ?? "").trim().toLowerCase();
  if (normalizedMimeType.startsWith("image/")) return "imagem";
  if (normalizedMimeType.startsWith("audio/")) return "audio";
  if (normalizedMimeType.startsWith("video/")) return "video";
  if (normalizedMimeType) return "documento";

  const normalizedMediaUrl = String(mediaUrl ?? "").trim().toLowerCase();
  if (normalizedMediaUrl.match(/\.(png|jpe?g|webp|gif)(\?|$)/i)) return "imagem";
  if (normalizedMediaUrl.match(/\.(ogg|mp3|wav|m4a|webm)(\?|$)/i)) return "audio";
  if (normalizedMediaUrl.match(/\.(mp4|mov|mkv)(\?|$)/i)) return "video";
  if (normalizedMediaUrl) return "documento";
  return "texto";
}

function firstPayloadString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function mimeTypeForKind(kind: string) {
  if (kind === "imagem") return "image/jpeg";
  if (kind === "audio") return "audio/ogg";
  if (kind === "video") return "video/mp4";
  return "application/octet-stream";
}

function fileNameForKind(kind: string) {
  if (kind === "imagem") return "imagem.jpg";
  if (kind === "audio") return "audio.ogg";
  if (kind === "video") return "video.mp4";
  return "documento";
}

function getConversationTags(conversation?: ChatConversation) {
  if (!conversation) return [];
  const tags = conversation.memory?.tags;
  if (!Array.isArray(tags)) return [];
  return normalizeTags(tags.map((tag) => {
    if (typeof tag === "string") return tag;
    if (tag && typeof tag === "object" && "label" in tag) return String((tag as { label?: unknown }).label ?? "");
    return "";
  }));
}

function isConversationBlocked(conversation?: ChatConversation) {
  if (!conversation) return false;
  return conversation.state === "BLOCKED" || conversation.memory?.blocked === true;
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function sumScheduleQuantity(blocks: ScheduleBlock[]) {
  return blocks.reduce((total, block) => total + (Number(block.quantity) || 0), 0);
}

function countBulkPhones(value: string) {
  return extractPhoneCandidates(value).length;
}

function mergePhoneText(current: string, next: string) {
  const currentLines = current.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const nextLines = extractPhoneCandidates(next);
  return [...currentLines, ...nextLines].join("\n");
}

function extractPhoneTextFromRows(rows: unknown[][]) {
  const headers = rows[0]?.map((cell) => String(cell ?? "").toLowerCase().trim()) ?? [];
  const preferredColumn = headers.findIndex((header) => ["telefone", "whatsapp", "celular", "numero", "número", "phone"].some((keyword) => header.includes(keyword)));
  const values = rows.flatMap((row, rowIndex) => {
    if (rowIndex === 0 && preferredColumn >= 0) return [];
    if (preferredColumn >= 0) return [String(row[preferredColumn] ?? "")];
    return row.map((cell) => String(cell ?? ""));
  });
  return extractPhoneCandidates(values.join("\n")).join("\n");
}

function extractPhoneCandidates(value: string) {
  return value
    .split(/[\n,;|\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\D/g, ""))
    .map((digits) => {
      if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
      const withoutZeros = digits.replace(/^0+/, "");
      if (withoutZeros.length === 10 || withoutZeros.length === 11) return `55${withoutZeros}`;
      return withoutZeros;
    })
    .filter((digits) => /^55\d{10,11}$/.test(digits));
}

function TagList({ tags, compact = false, onRemove }: { tags: string[]; compact?: boolean; onRemove?: (tag: string) => void }) {
  if (!tags.length) {
    return compact ? null : <p className="text-xs text-muted-foreground">Sem etiquetas</p>;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "justify-end" : ""}`}>
      {tags.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
          {tag}
          {onRemove ? (
            <button type="button" onClick={() => onRemove(tag)} aria-label={`Remover etiqueta ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function mergeConversations(serverConversations: ChatConversation[], currentConversations: ChatConversation[]) {
  const currentById = new Map(currentConversations.map((conversation) => [conversation.id, conversation]));
  const serverIds = new Set(serverConversations.map((conversation) => conversation.id));
  const merged = serverConversations.map((conversation) => {
    const current = currentById.get(conversation.id);
    return current
      ? { ...conversation, messages: mergeMessageSnapshots(conversation.messages, current.messages, conversation.id) }
      : conversation;
  });

  const localOnly = currentConversations.filter((conversation) => !serverIds.has(conversation.id));
  return [...merged, ...localOnly].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function mergeMessageSnapshots(serverMessages: ChatMessage[], currentMessages: ChatMessage[], conversationId: string) {
  const serverIds = new Set(
    serverMessages.flatMap((message) => [message.id, message.providerId].filter((value): value is string => Boolean(value))),
  );
  const localMessagesToKeep = currentMessages.filter((message) => {
    if (!message.id.startsWith("local-")) return false;
    if (serverIds.has(message.id) || (message.providerId && serverIds.has(message.providerId))) return false;
    if (message.direction !== "outbound") return false;
    if (isFailedLocalMessage(message) || isPendingLocalMessage(message)) return true;
    return false;
  });
  return [...serverMessages, ...localMessagesToKeep]
    .filter((message) => message.id && conversationId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function addLocalMessage(conversations: ChatConversation[], conversationId: string, message: ChatMessage) {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? { ...conversation, updatedAt: message.createdAt, messages: [...conversation.messages, message] }
      : conversation,
  );
}

function markLocalMessageFailed(conversations: ChatConversation[], messageId: string) {
  return conversations.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map((message) =>
      message.id === messageId ? { ...message, rawPayload: { status: "falha" } } : message,
    ),
  }));
}

function isPendingLocalMessage(message: ChatMessage) {
  return message.id.startsWith("local-") && getLocalMessageStatus(message) === "pendente";
}

function isFailedLocalMessage(message: ChatMessage) {
  return message.id.startsWith("local-") && getLocalMessageStatus(message) === "falha";
}

function getLocalMessageStatus(message: ChatMessage) {
  if (!message.rawPayload || typeof message.rawPayload !== "object") return "";
  return String((message.rawPayload as { status?: unknown }).status ?? "");
}

function getBroadcastProgress(item: BroadcastDispatch) {
  const actionable = Math.max(1, item.total - item.invalid - item.duplicate);
  const finished = item.recipientStatuses.filter((recipient) =>
    ["enviado", "sem_whatsapp", "falha_validacao", "falha_envio", "auto_pausado", "cancelado"].includes(recipient.status),
  ).length;
  return Math.min(100, Math.round((finished / actionable) * 100));
}

function countBroadcastRecipientsByStatus(item: BroadcastDispatch, status: string) {
  return item.recipientStatuses.filter((recipient) => recipient.status === status).length;
}

function formatBroadcastStatus(status: string) {
  const labels: Record<string, string> = {
    agendado: "Agendado",
    processando: "Processando",
    enviado: "Enviado",
    sem_whatsapp: "Sem WhatsApp",
    falha_validacao: "Falha validação",
    falha_envio: "Falha envio",
    auto_pausado: "Pausado",
    cancelado: "Cancelado",
    concluido: "Concluído",
    concluido_parcial: "Concluído parcial",
    concluido_sem_envios: "Concluído sem envios",
  };
  return labels[status] ?? status;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-950/60 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="glass-panel neon-ring flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl">
        <div className="shrink-0 flex items-center justify-between border-b border-blue-400/15 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pr-3">{children}</div>
      </div>
    </div>
  );
}
