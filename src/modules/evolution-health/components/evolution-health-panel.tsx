"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Server, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiResult } from "@/types/api";

type HealthStatus = "ok" | "warning" | "error";

type HealthData = {
  overall: HealthStatus;
  checkedAt: string;
  durationMs: number;
  config: {
    apiUrl: string;
    instance: string;
    defaultNumber: string;
    webhookUrl: string;
    cronSecretConfigured: boolean;
    broadcast: {
      minDelaySeconds: number;
      maxDelaySeconds: number;
      maxBatchSize: number;
      maxPerHour: number;
    };
  };
  checks: Array<{
    key: string;
    label: string;
    status: HealthStatus;
    durationMs: number;
    message: string;
  }>;
  broadcastQueue: {
    totalDispatches: number;
    pendingRecipients: number;
    processingRecipients: number;
    sentRecipients: number;
    failedRecipients: number;
    noWhatsappRecipients: number;
    canceledRecipients: number;
    pausedRecipients: number;
  };
  recentLogs: Array<{
    id: string;
    level: string;
    category: string;
    message: string;
    endpoint: string | null;
    statusCode: number | null;
    createdAt: string;
  }>;
};

export function EvolutionHealthPanel() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadHealth() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/evolution/health", { cache: "no-store" });
      const payload = await response.json() as ApiResult<HealthData>;
      if (payload.status !== "success") {
        setError(payload.message);
        return;
      }
      setData(payload.data);
    } catch {
      setError("Nao foi possivel consultar a saude da Evolution.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  const statusCopy = useMemo(() => {
    if (!data) return { label: "Consultando", className: "border-blue-400/20 bg-blue-500/10 text-blue-100", icon: Loader2 };
    if (data.overall === "ok") return { label: "Saudável", className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-100", icon: CheckCircle2 };
    if (data.overall === "warning") return { label: "Atenção", className: "border-amber-400/25 bg-amber-500/10 text-amber-100", icon: AlertTriangle };
    return { label: "Crítico", className: "border-red-400/25 bg-red-500/10 text-red-100", icon: XCircle };
  }, [data]);
  const StatusIcon = statusCopy.icon;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${statusCopy.className}`}>
          <StatusIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Saúde Evolution: {statusCopy.label}
        </div>
        <Button type="button" variant="outline" onClick={() => void loadHealth()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard title="Pendentes" value={data?.broadcastQueue.pendingRecipients ?? 0} hint="Aguardando cron" tone="blue" />
        <MetricCard title="Processando" value={data?.broadcastQueue.processingRecipients ?? 0} hint="Se ficar parado, exige atenção" tone="amber" />
        <MetricCard title="Enviados" value={data?.broadcastQueue.sentRecipients ?? 0} hint="Histórico atual" tone="green" />
        <MetricCard title="Falhas" value={(data?.broadcastQueue.failedRecipients ?? 0) + (data?.broadcastQueue.noWhatsappRecipients ?? 0)} hint="Envio, validação ou sem WhatsApp" tone="red" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-300" />
              Testes da Evolution API
            </CardTitle>
            <CardDescription>
              Checagens em tempo real da instância, webhook e número padrão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.checks.map((check) => (
              <div key={check.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-400/15 bg-blue-500/5 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusDot status={check.status} />
                    <p className="font-semibold text-white">{check.label}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{check.message}</p>
                </div>
                <span className="rounded-full border border-blue-400/15 bg-slate-950/40 px-3 py-1 text-xs text-slate-300">
                  {check.durationMs} ms
                </span>
              </div>
            )) ?? (
              <SkeletonRows />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-300" />
              Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="API" value={data?.config.apiUrl ?? "—"} />
            <InfoRow label="Instância" value={data?.config.instance ?? "—"} />
            <InfoRow label="Número" value={data?.config.defaultNumber ?? "—"} />
            <InfoRow label="Webhook" value={data?.config.webhookUrl ?? "—"} />
            <InfoRow label="Cron protegido" value={data?.config.cronSecretConfigured ? "Sim" : "Não"} />
            <div className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3 text-xs text-muted-foreground">
              <p className="mb-2 flex items-center gap-2 font-semibold text-slate-100">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Regras de disparo
              </p>
              <p>Intervalo: {data?.config.broadcast.minDelaySeconds ?? "—"}s a {data?.config.broadcast.maxDelaySeconds ?? "—"}s</p>
              <p>Lote máximo: {data?.config.broadcast.maxBatchSize ?? "—"} números</p>
              <p>Limite/hora: {data?.config.broadcast.maxPerHour ?? "—"} mensagens</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fila de disparos</CardTitle>
            <CardDescription>Resumo calculado direto no banco, sem carregar o histórico inteiro.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <MiniMetric label="Históricos" value={data?.broadcastQueue.totalDispatches ?? 0} />
            <MiniMetric label="Cancelados" value={data?.broadcastQueue.canceledRecipients ?? 0} />
            <MiniMetric label="Sem WhatsApp" value={data?.broadcastQueue.noWhatsappRecipients ?? 0} />
            <MiniMetric label="Auto pausados" value={data?.broadcastQueue.pausedRecipients ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-blue-300" />
              Logs recentes
            </CardTitle>
            <CardDescription>
              Últimos eventos técnicos ligados à Evolution e WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.recentLogs.length ? data.recentLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-blue-400/15 bg-slate-950/35 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-semibold ${log.level === "ERROR" || log.level === "FATAL" ? "text-red-200" : log.level === "WARNING" ? "text-amber-200" : "text-emerald-200"}`}>
                    {log.level}
                  </span>
                  <span className="text-muted-foreground">{formatDate(log.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-100">{log.message}</p>
                {log.endpoint || log.statusCode ? (
                  <p className="mt-1 text-muted-foreground">{log.endpoint ?? "endpoint"} {log.statusCode ? `· HTTP ${log.statusCode}` : ""}</p>
                ) : null}
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-blue-400/20 bg-blue-500/5 p-6 text-center text-sm text-muted-foreground">
                Nenhum log recente da Evolution.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ title, value, hint, tone }: { title: string; value: number; hint: string; tone: "blue" | "green" | "amber" | "red" }) {
  const tones = {
    blue: "from-blue-500/25 to-blue-500/5 border-blue-400/20",
    green: "from-emerald-500/20 to-emerald-500/5 border-emerald-400/20",
    amber: "from-amber-500/20 to-amber-500/5 border-amber-400/20",
    red: "from-red-500/20 to-red-500/5 border-red-400/20",
  };
  return (
    <Card className={`border bg-gradient-to-br ${tones[tone]}`}>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: HealthStatus }) {
  const className = status === "ok" ? "bg-emerald-400" : status === "warning" ? "bg-amber-400" : "bg-red-400";
  return <span className={`h-2.5 w-2.5 rounded-full ${className} shadow-[0_0_14px_currentColor]`} />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-blue-400/15 bg-slate-950/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium text-slate-100">{value || "—"}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function SkeletonRows() {
  return Array.from({ length: 3 }).map((_, index) => (
    <div key={index} className="h-20 animate-pulse rounded-xl border border-blue-400/15 bg-blue-500/5" />
  ));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
