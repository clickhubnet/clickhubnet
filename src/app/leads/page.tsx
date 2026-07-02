import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { LeadBoard } from "@/modules/leads/components/lead-board";

export default function LeadsPage() {
  return (
    <AppShell title="Leads">
      <Suspense>
        <LeadBoard />
      </Suspense>
    </AppShell>
  );
}
