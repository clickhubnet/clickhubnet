import { AppShell } from "@/components/layout/app-shell";
import { UserManagement } from "@/modules/usuarios/components/user-management";

export default function UsuariosPage() {
  return (
    <AppShell title="Usuários">
      <UserManagement />
    </AppShell>
  );
}
