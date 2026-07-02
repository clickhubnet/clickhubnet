"use client";

import type { LucideIcon } from "lucide-react";
import { BarChart3, CircleDollarSign, Receipt, Users } from "lucide-react";
import { MetricCard } from "@/components/cards/metric-card";

export type DashboardMetricsData = {
  newLeads: number;
  wonLeads: number;
  totalValue: number;
  expenses: number;
  showExpenses?: boolean;
};

type MetricIcons = Record<"newLeads" | "wonLeads" | "totalValue" | "expenses", LucideIcon>;

const icons: MetricIcons = {
  newLeads: Users,
  wonLeads: BarChart3,
  totalValue: CircleDollarSign,
  expenses: Receipt,
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function DashboardMetrics({ data, loading }: { data: DashboardMetricsData | null; loading: boolean }) {
  const showExpenses = data?.showExpenses ?? true;

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${showExpenses ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
      <MetricCard
        title="Leads Novos"
        value={loading ? "..." : String(data?.newLeads ?? 0)}
        helper="Entraram hoje"
        icon={icons.newLeads}
        href="/leads?created=today"
      />
      <MetricCard
        title="Leads Fechados"
        value={loading ? "..." : String(data?.wonLeads ?? 0)}
        helper="Movidos para Fechado"
        icon={icons.wonLeads}
        href="/leads?status=WON"
      />
      <MetricCard
        title="Valor Total"
        value={loading ? "..." : currency.format(data?.totalValue ?? 0)}
        helper="Planos fechados"
        icon={icons.totalValue}
        href="/leads?status=WON"
      />
      {showExpenses ? (
        <MetricCard
          title="Despesas"
          value={loading ? "..." : currency.format(data?.expenses ?? 0)}
          helper="A pagar"
          icon={icons.expenses}
        />
      ) : null}
    </div>
  );
}
