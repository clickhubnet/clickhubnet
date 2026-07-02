import { AppShell } from "@/components/layout/app-shell";
import { DashboardPanel } from "@/modules/dashboard/components/dashboard-panel";

export default function DashboardPage() {
  return (
    <AppShell title="Dashboard">
      <DashboardPanel />
    </AppShell>
  );
}
