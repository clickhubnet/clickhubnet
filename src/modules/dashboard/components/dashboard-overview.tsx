"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const statusLabels: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Contato",
  QUALIFIED: "Qualificado",
  PROPOSAL: "Proposta",
  WON: "Fechado",
  LOST: "Perdido",
};

const statusOrder = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];
const chartColors = ["#158cff", "#33d052", "#ffad0a", "#8b35ff", "#25c064", "#ff4f65"];

export type DashboardOverviewData = {
  leadStatuses: Array<{ status: string; count: number }>;
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

  const statusData = funnelData.map((item) => ({
    name: item.label,
    value: item.count,
  }));

  const chartData = data?.leadChart ?? [];
  const planData = data?.planSales ?? [];

  return (
    <div className="mt-5 space-y-4">
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
            <CardTitle>Status do Kanban</CardTitle>
            <CardDescription>Distribuicao atual dos leads por etapa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                    {statusData.map((entry, index) => (
                      <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {funnelData.map((item, index) => (
                <div key={item.status} className="flex items-center justify-between rounded-xl border border-blue-400/15 bg-blue-500/5 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: chartColors[index % chartColors.length] }}
                    />
                    {item.label}
                  </span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
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
