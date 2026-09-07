import { AppShell } from "@/components/layout/app-shell";
import { EvolutionHealthPanel } from "@/modules/evolution-health/components/evolution-health-panel";

export default function SaudeEvolutionPage() {
  return (
    <AppShell title="Saúde WhatsApp">
      <EvolutionHealthPanel />
    </AppShell>
  );
}
