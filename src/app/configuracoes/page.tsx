import { AppShell } from "@/components/layout/app-shell";
import { SettingsPanel } from "@/modules/configuracoes/components/settings-panel";

export default function ConfiguracoesPage() {
  return (
    <AppShell title="Configurações">
      <SettingsPanel />
    </AppShell>
  );
}
