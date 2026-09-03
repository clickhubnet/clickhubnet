import { AppShell } from "@/components/layout/app-shell";
import { ConversationsPanel } from "@/modules/conversas/components/conversations-panel";

export default function ConversasPage() {
  return (
    <AppShell title="Conversas">
      <ConversationsPanel />
    </AppShell>
  );
}
