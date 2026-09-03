"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Phone, Plus, RefreshCw, Send, Tag, Trash2, X } from "lucide-react";
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
};

const emptyNewConversation: NewConversationState = {
  name: "",
  phone: "",
};

export function ConversationsPanel() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [newConversation, setNewConversation] = useState(emptyNewConversation);
  const [message, setMessage] = useState("");
  const [newTag, setNewTag] = useState("");
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
  const availableTags = useMemo(() => {
    return Array.from(new Set(conversations.flatMap((conversation) => getConversationTags(conversation)))).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

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
    setActiveId((current) => (nextActiveId ?? current) || (result.data[0]?.id ?? ""));
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void refreshConversations();
    const onFocus = () => void refreshConversations();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshConversations();
    }, 3000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.id, active?.messages.length]);

  async function handleCreateConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newConversation),
    });
    const result = await response.json() as ApiResult<ChatConversation>;
    if (result.status !== "success") {
      setError(result.message);
      return;
    }

    setNewConversation(emptyNewConversation);
    await refreshConversations(result.data.id);
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !message.trim() || sending) return;
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

  async function handleDeleteConversation() {
    if (!active || !window.confirm(`Excluir conversa de ${getConversationName(active)}?`)) return;
    setError("");
    const response = await fetch("/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id }),
    });
    const result = await response.json() as ApiResult<{ id: string }>;
    if (result.status !== "success") {
      setError(result.message);
      return;
    }
    setActiveId("");
    await refreshConversations();
  }

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[360px_1fr]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Conversas</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {refreshing && !loading ? "Atualizando em tempo real..." : "Mensagens em tempo real"}
              </p>
            </div>
            <Button size="icon" variant="ghost" type="button" onClick={() => void refreshConversations()} aria-label="Atualizar conversas">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <form className="space-y-3 rounded-md border bg-muted/30 p-3" onSubmit={handleCreateConversation}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plus className="h-4 w-4" />
              Nova conversa
            </div>
            <Input
              value={newConversation.name}
              onChange={(event) => setNewConversation((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nome do contato"
            />
            <Input
              value={newConversation.phone}
              onChange={(event) => setNewConversation((current) => ({ ...current, phone: event.target.value }))}
              placeholder="+5511999999999"
              required
            />
            <Button className="w-full" type="submit" size="sm">Iniciar</Button>
          </form>

          {error ? <p className="rounded-md bg-red-500/10 p-3 text-sm text-red-600">{error}</p> : null}

          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando conversas</p>
            ) : conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setActiveId(conversation.id)}
                  className={`w-full rounded-md border p-3 text-left transition hover:bg-muted ${conversation.id === active?.id ? "border-primary bg-primary/5" : "bg-background"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{getConversationName(conversation)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {conversation.phone}
                      </p>
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
                <Button variant="ghost" size="icon" type="button" onClick={() => void handleDeleteConversation()} aria-label="Excluir conversa">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <div className="border-b bg-background p-3">
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
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${activeTags.includes(tag) ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                {active.messages.length ? (
                  active.messages.map((item) => (
                    <div key={item.id} className={`flex ${item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-md px-3 py-2 text-sm shadow-sm ${item.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-white text-slate-900"}`}>
                        <p className="whitespace-pre-wrap">{item.body}</p>
                        <p className={`mt-1 text-[11px] ${item.direction === "outbound" ? "text-primary-foreground/70" : "text-slate-400"}`}>
                          {formatDate(item.createdAt)}{isPendingLocalMessage(item) ? " · enviando" : ""}{isFailedLocalMessage(item) ? " · falha" : ""}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Envie uma mensagem para iniciar.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <form className="border-t bg-background p-4" onSubmit={handleSendMessage}>
                <div className="flex gap-3">
                  <Textarea
                    className="min-h-12 resize-none"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Digite uma mensagem"
                  />
                  <Button className="h-auto px-5" type="submit" disabled={sending || !message.trim()}>
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

function getLastMessage(conversation: ChatConversation) {
  return [...conversation.messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).at(-1);
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

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
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
