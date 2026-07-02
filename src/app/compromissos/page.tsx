import { AppShell } from "@/components/layout/app-shell";
import { AppointmentBoard } from "@/modules/compromissos/components/appointment-board";

export default function CompromissosPage() {
  return (
    <AppShell title="Compromissos">
      <AppointmentBoard />
    </AppShell>
  );
}
