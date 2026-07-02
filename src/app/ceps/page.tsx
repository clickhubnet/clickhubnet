import { AppShell } from "@/components/layout/app-shell";
import { CepPanel } from "@/modules/ceps/components/cep-panel";

export default function CepsPage() {
  return (
    <AppShell title="CEPs">
      <CepPanel />
    </AppShell>
  );
}
