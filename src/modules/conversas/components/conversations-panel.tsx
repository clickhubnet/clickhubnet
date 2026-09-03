"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageCircle, Phone, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? conversations[0],
    [activeId, conversations],
  );

  async function refreshConversations(nextActiveId?: string) {
    setError("");
    const response = await fetch("/api/conversations", { cache: "no-store" });
    const result = await response.json() as ApiResult<ChatConversation[]>;
    if (result.status !== "success") {
      setError(result.message);
      setLoading(false);
      return;
    }

    setConversations(result.data);
    setActiveId((current) => (nextActiveId ?? current) || (result.data[0]?.id ?? ""));
    setLoading(false);
  }

  useEffect(() => {
    void refreshConversations();
    const interval = window.setInterval(() => void refreshConversations(), 8000);
    return () => window.clearInterval(interval);
  }, []);

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

    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: active.phone,
        message,
        conversationId: active.id,
        contactName: getConversationName(active),
      }),
    });
    const result = await response.json() as ApiResult<{ conversationId: string }>;
    if (result.status !== "success") {
      setError(result.message);
      setSending(false);
      return;
    }

    setMessage("");
    await refreshConversations(result.data.conversationId);
    setSending(false);
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
              <p className="mt-1 text-sm text-muted-foreground">Evolution API</p>
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
                    <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700">
                      {getConversationSource(conversation)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {conversation.messages.at(-1)?.body ?? "Sem mensagens ainda"}
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
                </div>
                <Button variant="ghost" size="icon" type="button" onClick={() => void handleDeleteConversation()} aria-label="Excluir conversa">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
                {active.messages.length ? (
                  active.messages.map((item) => (
                    <div key={item.id} className={`flex ${item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-md px-3 py-2 text-sm shadow-sm ${item.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-white text-slate-900"}`}>
                        <p>{item.body}</p>
                        <p className={`mt-1 text-[11px] ${item.direction === "outbound" ? "text-primary-foreground/70" : "text-slate-400"}`}>
                          {formatDate(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex h-full items-center justify-center rounded-md border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
                    Nenhuma mensagem ainda. Envie uma mensagem pela Evolution API para iniciar.
                  </div>
                )}
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

function getConversationSource(conversation: ChatConversation) {
  return String(conversation.memory?.source ?? conversation.state ?? "manual");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
