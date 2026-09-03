"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  performanceChart?: Array<{ date: string; label: string; leads: number; conversations: number }>;
  leadChart?: Array<{ date: string; label: string; count: number }>;
  planSales: Array<{ planId: string | null; planName: string; count: number; totalValue: number }>;
  wonLeads?: number;
  totalValue?: number;
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

const integer = new Intl.NumberFormat("pt-BR");

export function DashboardOverview({ data, loading }: { data: DashboardOverviewData | null; loading: boolean }) {
  const funnelData = statusOrder.map((status) => ({
    status,
    label: statusLabels[status],
    count: data?.leadStatuses.find((item) => item.status === status)?.count ?? 0,
  }));

  const performanceData = data?.performanceChart ?? data?.leadChart?.map((item) => ({
    date: item.date,
    label: item.label,
    leads: item.count,
    conversations: 0,
  })) ?? [];
  const planData = data?.planSales ?? [];
  const totalSales = data?.wonLeads ?? planData.reduce((sum, item) => sum + item.count, 0);
  const totalRevenue = data?.totalValue ?? planData.reduce((sum, item) => sum + item.totalValue, 0);
  const averageTicket = totalSales ? totalRevenue / totalSales : 0;

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

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr_1fr]">
        <Card className="rounded-[10px] border-[#0c3569] bg-[linear-gradient(180deg,rgba(3,26,59,0.98),rgba(2,23,52,0.98))]">
          <CardHeader className="flex-row items-center justify-between p-[18px] pb-[10px]">
            <div>
              <CardTitle className="text-[16px] font-medium text-white">Desempenho geral</CardTitle>
              <div className="mt-[18px] flex items-center gap-6 text-[12px] text-[#9aa8c2]">
                <span className="flex items-center gap-2"><span className="h-[4px] w-[16px] rounded-full bg-[#1684ff]" />Leads</span>
                <span className="flex items-center gap-2"><span className="h-[4px] w-[16px] rounded-full bg-[#33d052]" />Conversas</span>
              </div>
            </div>
            <button className="rounded-[6px] border border-blue-400/15 bg-blue-500/5 px-3 py-2 text-[12px] text-[#9aa8c2]" type="button">
              Últimos 7 dias⌄
            </button>
          </CardHeader>
          <CardContent className="px-[18px] pb-[16px] pt-0">
            <div className="h-[205px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceData} margin={{ left: -18, right: 8, top: 14, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.10)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#7f8da8" />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="#7f8da8" />
                  <Tooltip contentStyle={{ background: "#031936", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 12, color: "#e2e8f0" }} />
                  <Line dataKey="leads" name="Leads" type="monotone" stroke="#1684ff" strokeWidth={2.2} dot={{ r: 3, fill: "#1684ff" }} activeDot={{ r: 4 }} />
                  <Line dataKey="conversations" name="Conversas" type="monotone" stroke="#33d052" strokeWidth={2.2} dot={{ r: 3, fill: "#33d052" }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[10px] border-[#0c3569] bg-[linear-gradient(180deg,rgba(3,26,59,0.98),rgba(2,23,52,0.98))]">
          <CardHeader>
            <CardTitle>Resumo de vendas</CardTitle>
            <CardDescription>Indicadores comerciais fechados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow label="Vendas fechadas" value={integer.format(totalSales)} />
            <SummaryRow label="Faturamento" value={currency.format(totalRevenue)} />
            <SummaryRow label="Ticket médio" value={currency.format(averageTicket)} />
            <SummaryRow label="Leads ganhos" value={integer.format(totalSales)} />
          </CardContent>
        </Card>

        <Card className="rounded-[10px] border-[#0c3569] bg-[linear-gradient(180deg,rgba(3,26,59,0.98),rgba(2,23,52,0.98))]">
          <CardHeader>
            <CardTitle>Principais Planos Vendidos</CardTitle>
            <CardDescription>Quantidade e valor total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-[10px]">
            {planData.length ? (
              planData.slice(0, 5).map((item, index) => (
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
                        backgroundColor: ["#1684ff", "#33d052", "#8b35ff", "#ffad0a", "#69a7ff"][index % 5],
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-blue-400/15 bg-blue-500/5 px-4 py-3">
      <p className="text-[12px] text-[#8798b8]">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-white">{value}</p>
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
