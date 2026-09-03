"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import { Ban, CheckCircle2, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCog, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { permissions } from "@/constants/permissions";
import { useApiResource } from "@/hooks/use-api-resource";
import { useCurrentUser } from "@/hooks/use-current-user";

type UserItem = {
  id: string; name: string; email: string; phone: string | null; title: string | null;
  role: "ADMIN" | "EMPLOYEE"; status: "ACTIVE" | "BLOCKED";
  permissions: Record<string, boolean> | null; lastLoginAt?: string | null;
};

const permissionGroups = [
  { title: "Dashboard", access: permissions.dashboardView, items: [[permissions.dashboardView, "Acessar Dashboard"], [permissions.dashboardEdit, "Editar informações"]] },
  { title: "Leads", access: permissions.leadsView, items: [[permissions.leadsView, "Acessar Leads"], [permissions.leadsCreate, "Cadastrar leads"], [permissions.leadsEdit, "Editar leads"], [permissions.leadsDelete, "Excluir leads"], [permissions.leadsMoveKanban, "Mover no Kanban"], [permissions.leadsExport, "Exportar planilha"]] },
  { title: "Conversas", access: permissions.conversationsView, items: [[permissions.conversationsView, "Acessar Conversas"]] },
  { title: "Compromissos", access: permissions.appointmentsView, items: [[permissions.appointmentsView, "Acessar Compromissos"], [permissions.appointmentsCreate, "Criar compromissos"], [permissions.appointmentsEdit, "Editar compromissos"], [permissions.appointmentsDelete, "Excluir compromissos"]] },
  { title: "Despesas", access: permissions.expensesView, items: [[permissions.expensesView, "Acessar Despesas"], [permissions.expensesEdit, "Cadastrar e editar despesas"], [permissions.expensesDelete, "Excluir despesas"]] },
  { title: "CEPs", access: permissions.cepsView, items: [[permissions.cepsView, "Consultar cobertura de CEPs"]] },
  { title: "N8N", access: permissions.agentsEdit, items: [[permissions.agentsEdit, "Acessar N8N"], [permissions.agentsCreate, "Cadastrar agentes"], [permissions.plansEdit, "Editar planos"], [permissions.openAiEdit, "Configurar OpenAI"], [permissions.zapiEdit, "Configurar Z-API"]] },
  { title: "Configurações", access: permissions.settingsView, items: [[permissions.settingsView, "Acessar Configurações"], [permissions.settingsEdit, "Editar configurações"]] },
] as const;

export function UserManagement() {
  const usersResource = useApiResource<UserItem[]>("/api/users");
  const currentUser = useCurrentUser();
  const [editing, setEditing] = useState<UserItem | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const users = usersResource.data ?? [];
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.title ?? ""}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const admins = users.filter((user) => user.role === "ADMIN" && user.status === "ACTIVE").length;
  const employees = users.filter((user) => user.role === "EMPLOYEE" && user.status === "ACTIVE").length;
  const blocked = users.filter((user) => user.status === "BLOCKED").length;

  async function request(id: string | null, payload?: Record<string, unknown>, method = "PUT") {
    setSaving(true); setNotice("");
    const response = await fetch(id ? `/api/users/${id}` : "/api/users", { method, headers: { "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
    const result = await response.json(); setSaving(false); setNotice(result.message ?? "Operação concluída.");
    if (!response.ok) return false;
    await usersResource.refresh(); return true;
  }

  async function save(payload: Record<string, unknown>) {
    const ok = await request(editing?.id ?? null, payload, editing ? "PUT" : "POST");
    if (ok) setEditing(undefined);
  }

  async function toggleBlock(user: UserItem) {
    if (user.id === currentUser.data?.id) return setNotice("Você não pode bloquear a própria conta.");
    await request(user.id, { status: user.status === "ACTIVE" ? "BLOCKED" : "ACTIVE" });
  }

  async function remove(user: UserItem) {
    if (user.id === currentUser.data?.id) return setNotice("Você não pode excluir a própria conta.");
    if (!window.confirm(`Excluir o usuário ${user.name}?`)) return;
    await request(user.id, undefined, "DELETE");
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Controle de usuários</h2><p className="text-sm text-muted-foreground">Administradores e funcionários com acesso controlado por aba.</p></div><Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" />Cadastrar usuário</Button></div>
    {notice && <p className="rounded-md border bg-card px-4 py-3 text-sm">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><Metric icon={<ShieldCheck className="h-5 w-5" />} label="Administradores" value={admins} /><Metric icon={<Users className="h-5 w-5" />} label="Funcionários" value={employees} /><Metric icon={<Ban className="h-5 w-5" />} label="Bloqueados" value={blocked} /></div>
    <div className="relative max-w-lg"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nome, e-mail ou cargo" /></div>

    <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Usuário</th><th className="px-4 py-3 font-medium">Perfil</th><th className="px-4 py-3 font-medium">Acesso</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Ações</th></tr></thead><tbody>
      {usersResource.loading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Carregando usuários</td></tr> : filtered.map((user) => <tr key={user.id} className="border-b last:border-0">
        <td className="px-4 py-4"><p className="font-medium">{user.name}{user.id === currentUser.data?.id && <span className="ml-2 text-xs text-primary">Você</span>}</p><p className="text-muted-foreground">{user.email}</p><p className="text-xs text-muted-foreground">{user.phone || "Sem telefone"}</p></td>
        <td className="px-4 py-4"><p>{user.role === "ADMIN" ? "Administrador" : "Funcionário"}</p><p className="text-xs text-muted-foreground">{user.title || "Sem cargo"}</p></td>
        <td className="px-4 py-4">{user.role === "ADMIN" ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-4 w-4" />Todas as abas</span> : <span>{permissionGroups.filter((group) => user.permissions?.[group.access]).length} de {permissionGroups.length} abas</span>}</td>
        <td className="px-4 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${user.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{user.status === "ACTIVE" ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}{user.status === "ACTIVE" ? "Ativo" : "Bloqueado"}</span></td>
        <td className="px-4 py-4"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Editar usuário e senha" onClick={() => setEditing(user)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title={user.status === "ACTIVE" ? "Bloquear usuário" : "Desbloquear usuário"} disabled={user.id === currentUser.data?.id} onClick={() => toggleBlock(user)}>{user.status === "ACTIVE" ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</Button><Button size="icon" variant="ghost" title="Excluir usuário" disabled={user.id === currentUser.data?.id} onClick={() => remove(user)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td>
      </tr>)}{!usersResource.loading && !filtered.length && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum usuário encontrado</td></tr>}
    </tbody></table></div></CardContent></Card>
    {editing !== undefined && <UserModal user={editing} saving={saving} onClose={() => setEditing(undefined)} onSave={save} />}
  </div>;
}

function UserModal({ user, saving, onClose, onSave }: { user: UserItem | null; saving: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [role, setRole] = useState<UserItem["role"]>(user?.role ?? "EMPLOYEE");
  const [selected, setSelected] = useState<Record<string, boolean>>(user?.permissions ?? {});
  const toggleGroup = (group: typeof permissionGroups[number], checked: boolean) => setSelected((current) => ({ ...current, ...Object.fromEntries(group.items.map(([key]) => [key, checked])) }));
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const password = String(data.get("password") || ""); await onSave({ name: data.get("name"), email: data.get("email"), phone: data.get("phone"), title: data.get("title"), role, status: user?.status ?? "ACTIVE", permissions: role === "ADMIN" ? {} : selected, ...(password ? { password } : {}) }); }
  return <Modal title={user ? `Editar ${user.name}` : "Cadastrar usuário"} onClose={onClose}><form className="space-y-5" onSubmit={submit}>
    <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">Dados do usuário</legend><div className="grid gap-3 sm:grid-cols-2"><Input name="name" defaultValue={user?.name ?? ""} placeholder="Nome completo" required /><Input name="email" defaultValue={user?.email ?? ""} placeholder="E-mail" type="email" required /><Input name="phone" defaultValue={user?.phone ?? ""} placeholder="Telefone" /><Input name="title" defaultValue={user?.title ?? ""} placeholder="Cargo" /></div><div className="grid gap-3 sm:grid-cols-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as UserItem["role"])}><option value="EMPLOYEE">Funcionário</option><option value="ADMIN">Administrador</option></select><div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" name="password" type="password" minLength={8} required={!user} placeholder={user ? "Nova senha (opcional)" : "Senha inicial"} /></div></div></fieldset>
    {role === "ADMIN" ? <div className="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><ShieldCheck className="h-5 w-5 shrink-0" /><div><p className="font-medium">Acesso administrativo completo</p><p>Este usuário poderá acessar todas as abas e funções do sistema.</p></div></div> : <fieldset><legend className="mb-3 text-sm font-semibold">Abas e permissões do funcionário</legend><div className="grid gap-3 md:grid-cols-2">{permissionGroups.map((group) => { const all = group.items.every(([key]) => selected[key]); return <div key={group.title} className="rounded-md border p-3"><label className="flex items-center justify-between gap-3 font-medium"><span>{group.title}</span><input type="checkbox" checked={all} onChange={(event) => toggleGroup(group, event.target.checked)} /></label><div className="mt-3 space-y-2 border-t pt-3">{group.items.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={Boolean(selected[key])} onChange={(event) => setSelected((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div></div>; })}</div></fieldset>}
    <Button className="w-full" disabled={saving}><UserCog className="h-4 w-4" />{saving ? "Salvando..." : "Salvar usuário"}</Button>
  </form></Modal>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) { return <Card><CardContent className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div></CardContent></Card>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-md border bg-background shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-4"><h2 className="font-semibold">{title}</h2><Button type="button" size="icon" variant="ghost" onClick={onClose}><X className="h-5 w-5" /></Button></div><div className="p-5">{children}</div></div></div>; }
