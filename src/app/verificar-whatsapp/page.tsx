import { AppShell } from "@/components/layout/app-shell";
import { WhatsAppVerifierPanel } from "@/modules/whatsapp-verifier/components/whatsapp-verifier-panel";

export default function VerificarWhatsAppPage() {
  return (
    <AppShell title="Verificar WhatsApp">
      <WhatsAppVerifierPanel />
    </AppShell>
  );
}
