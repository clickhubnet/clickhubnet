"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardMetrics } from "@/modules/dashboard/components/dashboard-metrics";
import type { DashboardMetricsData } from "@/modules/dashboard/components/dashboard-metrics";
import { DashboardOverview } from "@/modules/dashboard/components/dashboard-overview";
import type { DashboardOverviewData } from "@/modules/dashboard/components/dashboard-overview";
import { useApiResource } from "@/hooks/use-api-resource";

type DashboardData = DashboardMetricsData & DashboardOverviewData;

export function DashboardPanel() {
  const [period, setPeriod] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [appliedPeriod, setAppliedPeriod] = useState("30");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(() => Date.now());

  const dashboardUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("refresh", String(refreshKey));
    if (appliedPeriod !== "custom") {
      params.set("period", appliedPeriod);
    }
    if (appliedPeriod === "custom" && appliedFrom) params.set("from", appliedFrom);
    if (appliedPeriod === "custom" && appliedTo) params.set("to", appliedTo);
    const query = params.toString();
    return query ? `/api/dashboard?${query}` : "/api/dashboard";
  }, [appliedPeriod, appliedFrom, appliedTo, refreshKey]);

  const customPeriod = period === "custom";
  const dashboard = useApiResource<DashboardData>(dashboardUrl);

  return (
    <div className="space-y-4">
      <div className="mb-[22px] flex flex-col items-end gap-3">
        <div className="flex gap-2">
          <select
            className="h-10 w-[118px] rounded-[8px] border border-[#0d376d] bg-[#031936]/80 px-3 text-sm text-[#c6d1e6]"
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              if (event.target.value !== "custom") {
                setAppliedPeriod(event.target.value);
                setAppliedFrom("");
                setAppliedTo("");
              }
            }}
          >
            <option value="30">Este mês</option>
            <option value="7">7 dias</option>
            <option value="90">90 dias</option>
            <option value="180">6 meses</option>
            <option value="365">1 ano</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        {customPeriod ? (
          <div className="glass-panel neon-ring flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-end md:justify-between">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Data inicial</span>
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">Data final</span>
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
            </div>
            <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setAppliedPeriod(period);
              setAppliedFrom(period === "custom" ? from : "");
              setAppliedTo(period === "custom" ? to : "");
              setRefreshKey(Date.now());
            }}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
              setPeriod("30");
              setAppliedPeriod("30");
              setAppliedFrom("");
              setAppliedTo("");
              setRefreshKey(Date.now());
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Limpar
          </Button>
            </div>
          </div>
        ) : null}
        </div>

      <DashboardMetrics data={dashboard.data} loading={dashboard.loading} />
      <DashboardOverview data={dashboard.data} loading={dashboard.loading} />
    </div>
  );
}
