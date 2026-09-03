"use client";

import { MetricCard } from "@/components/cards/metric-card";

export type DashboardMetricsData = {
  newLeads: number;
  totalLeads?: number;
  conversations?: number;
  appointments?: number;
  wonLeads: number;
  totalValue: number;
  expenses: number;
  showExpenses?: boolean;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integer = new Intl.NumberFormat("pt-BR");

export function DashboardMetrics({ data, loading }: { data: DashboardMetricsData | null; loading: boolean }) {
  return (
    <div className="grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title="Leads"
        value={loading ? "..." : integer.format(data?.totalLeads ?? data?.newLeads ?? 0)}
        trend="12,5%"
        color="blue"
        href="/leads?created=today"
      />
      <MetricCard
        title="Conversas"
        value={loading ? "..." : integer.format(data?.conversations ?? 0)}
        trend="8,7%"
        color="green"
        href="/conversas"
      />
      <MetricCard
        title="Compromissos"
        value={loading ? "..." : integer.format(data?.appointments ?? 0)}
        trend="15,3%"
        color="purple"
        href="/compromissos"
      />
      <MetricCard
        title="Faturamento"
        value={loading ? "..." : currency.format(data?.totalValue ?? 0)}
        trend="18,6%"
        color="orange"
        href="/leads?status=WON"
      />
    </div>
  );
}
