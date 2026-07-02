"use client";

import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiResource } from "@/hooks/use-api-resource";

type ConversationItem = {
  id: string;
  phone: string;
  state: string;
  updatedAt: string;
  lead: { name: string } | null;
  agent: { name: string } | null;
  messages: Array<{ id: string; direction: string; body: string; createdAt: string }>;
};

export function ConversationMonitor() {
  const { data, loading } = useApiResource<ConversationItem[]>("/api/conversations");

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Conversas do Chatbot</CardTitle>
        <CardDescription>Monitoramento das últimas interações processadas pela Joana</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando conversas</p>
        ) : data?.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.map((conversation) => (
              <div key={conversation.id} className="rounded-md border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{conversation.lead?.name ?? conversation.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {conversation.agent?.name ?? "Joana"} - {conversation.state}
                    </p>
                  </div>
                  <MessageCircle className="h-4 w-4 text-cyan-500" aria-hidden="true" />
                </div>
                <div className="mt-3 space-y-2">
                  {conversation.messages.map((message) => (
                    <p key={message.id} className="line-clamp-2 rounded-md bg-muted px-3 py-2 text-xs">
                      <span className="font-medium">
                        {message.direction === "inbound" ? "Cliente" : "Joana"}:
                      </span>{" "}
                      {message.body}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhuma conversa registrada
          </p>
        )}
      </CardContent>
    </Card>
  );
}
