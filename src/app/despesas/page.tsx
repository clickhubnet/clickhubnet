import { AppShell } from "@/components/layout/app-shell";
import { ExpensePanel } from "@/modules/despesas/components/expense-panel";

export default function DespesasPage() {
  return <AppShell title="Despesas"><ExpensePanel /></AppShell>;
}
