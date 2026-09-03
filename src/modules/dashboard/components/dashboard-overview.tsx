"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const statusLabels: Record<string, string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  CONTACTED: "Contato",
  PROPOSAL: "Proposta",
  WON: "Fechado",
  LOST: "Perdido",
};

const statusOrder = ["NEW", "QUALIFIED", "CONTACTED", "PROPOSAL", "WON", "LOST"];
const chartColors = ["#158cff", "#33d052", "#ffad0a", "#8b35ff", "#25c064", "#ff4f65"];
const kanbanColors: Record<string, { border: string; link: string; icon: string }> = {
  NEW: { border: "#1684ff", link: "#1684ff", icon: "" },
  QUALIFIED: { border: "#33d052", link: "#39ff45", icon: "" },
  CONTACTED: { border: "#ffad0a", link: "#ffbd22", icon: "" },
  PROPOSAL: { border: "#8b35ff", link: "#a057ff", icon: "" },
  WON: { border: "#25c064", link: "#39ff45", icon: "✓" },
  LOST: { border: "#ff4f65", link: "#ff4f65", icon: "×" },
};

export type DashboardOverviewData = {
  leadStatuses: Array<{ status: string; count: number }>;
  kanbanPreview?: Array<{
    status: string;
    leads: Array<{
      id: string;
      name: string;
      planName: string;
      updatedAt: string;
    }>;
  }>;
  leadChart: Array<{ date: string; label: string; count: number }>;
  planSales: Array<{ planId: string | null; planName: string; count: number; totalValue: number }>;
  recentLeads: Array<{
    id: string;
    name: string;
    phone: string;
    status: string;
    city: string | null;
    state: string | null;
    planName: string | null;
    assignedUserName: string | null;
    expectedValue: number;
    createdAt: string;
  }>;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function DashboardOverview({ data, loading }: { data: DashboardOverviewData | null; loading: boolean }) {
  const funnelData = statusOrder.map((status) => ({
    status,
    label: statusLabels[status],
    count: data?.leadStatuses.find((item) => item.status === status)?.count ?? 0,
  }));

  const chartData = data?.leadChart ?? [];
  const planData = data?.planSales ?? [];

  return (
    <div className="mt-5 space-y-4">
      <Card className="rounded-[10px] border-[#0c3569] bg-[linear-gradient(180deg,rgba(3,26,59,0.98),rgba(2,23,52,0.98))]">
        <CardHeader className="p-[18px] pb-[14px]">
          <CardTitle className="text-[16px] font-medium leading-none text-white">Status do Kanban</CardTitle>
        </CardHeader>
        <CardContent className="px-[14px] pb-[14px] pt-0">
          <div className="grid gap-[12px] xl:grid-cols-6">
            {funnelData.map((item) => (
              <KanbanStatusColumn
                key={item.status}
                count={item.count}
                leads={data?.kanbanPreview?.find((group) => group.status === item.status)?.leads ?? []}
                status={item.status}
                title={item.label}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Leads por Periodo</CardTitle>
            <CardDescription>Entradas de leads no intervalo selecionado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -20, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.14)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: "rgba(14,115,216,0.12)" }} contentStyle={{ background: "#031936", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 12, color: "#e2e8f0" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={entry.date} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo de vendas</CardTitle>
            <CardDescription>Principais planos fechados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {planData.slice(0, 4).length ? (
              planData.slice(0, 4).map((item, index) => (
                <div key={item.planId ?? item.planName} className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.planName}</span>
                    <span className="font-semibold">{currency.format(item.totalValue)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.count} venda(s)</p>
                  <div className="mt-2 h-2 rounded-full bg-slate-900/70">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(item.count * 12, 100)}%`,
                        backgroundColor: chartColors[index % chartColors.length],
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Sem planos vendidos
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Leads Recentes</CardTitle>
            <CardDescription>Ultimas oportunidades cadastradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-blue-400/10 rounded-xl border border-blue-400/15 bg-blue-500/5">
              {loading ? (
                <p className="p-4 text-sm text-muted-foreground">Carregando</p>
              ) : data?.recentLeads.length ? (
                data.recentLeads.map((lead) => (
                  <div key={lead.id} className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_160px_140px]">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{lead.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.phone}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>{lead.planName ?? "Sem plano"}</p>
                      <p>{lead.assignedUserName ?? "Sem responsavel"}</p>
                    </div>
                    <div className="text-xs text-muted-foreground md:text-right">
                      <p>{statusLabels[lead.status] ?? lead.status}</p>
                      <p>{currency.format(lead.expectedValue)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Sem leads cadastrados</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Principais Planos Vendidos</CardTitle>
            <CardDescription>Quantidade e valor total por plano fechado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {planData.length ? (
              planData.map((item, index) => (
                <div key={item.planId ?? item.planName} className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>{item.planName}</span>
                    <span className="font-semibold">{currency.format(item.totalValue)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.count} venda(s)</p>
                  <div className="mt-2 h-2 rounded-full bg-slate-900/70">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(item.count * 12, 100)}%`,
                        backgroundColor: chartColors[index % chartColors.length],
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Sem planos vendidos
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KanbanStatusColumn({
  status,
  title,
  count,
  leads,
}: {
  status: string;
  title: string;
  count: number;
  leads: NonNullable<DashboardOverviewData["kanbanPreview"]>[number]["leads"];
}) {
  const color = kanbanColors[status] ?? kanbanColors.NEW;
  const href = `/leads?status=${encodeURIComponent(status)}`;

  return (
    <div
      className="min-h-[260px] rounded-[6px] border bg-[rgba(2,20,45,0.62)] px-[10px] pb-[12px] pt-[11px]"
      style={{
        borderColor: `${color.border}cc`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 0 20px ${color.border}12`,
      }}
    >
      <div className="mb-[13px] flex items-center justify-between text-[14px] font-medium text-white">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      <div className="space-y-[6px]">
        {leads.length ? (
          leads.map((lead) => (
            <div key={lead.id} className="relative rounded-[6px] border border-blue-400/12 bg-[#031b3a]/78 px-[10px] py-[10px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium leading-4 text-[#c8d2e9]">{lead.name}</p>
                  <p className="mt-[3px] truncate text-[11px] leading-4 text-[#8798b8]">{lead.planName}</p>
                </div>
                {color.icon ? (
                  <span
                    className="mt-[1px] flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full border text-[10px] leading-none"
                    style={{ borderColor: color.border, color: color.border }}
                  >
                    {color.icon}
                  </span>
                ) : null}
              </div>
              <span className="absolute bottom-[10px] right-[10px] text-[10px] text-[#8b9ab6]">{formatRelativeTime(lead.updatedAt)}</span>
            </div>
          ))
        ) : (
          <div className="rounded-[6px] border border-dashed border-blue-400/15 bg-[#031b3a]/45 px-[10px] py-[18px] text-center text-[11px] text-[#8798b8]">
            Sem leads nesta etapa
          </div>
        )}
      </div>
      <a className="mt-[14px] block text-center text-[12px] font-medium" href={href} style={{ color: color.link }}>
        + Ver todos
      </a>
    </div>
  );
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `há ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} hora${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days > 1 ? "s" : ""}`;
}
