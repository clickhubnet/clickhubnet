import { AppShell } from "@/components/layout/app-shell";
import { AgentCenter } from "@/modules/n8n/components/agent-center";

export default function N8NPage() {
  return (
    <AppShell title="N8N">
      <AgentCenter />
    </AppShell>
  );
}
