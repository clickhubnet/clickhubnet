"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, Check, LayoutGrid, List, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";
import { useCurrentUser } from "@/hooks/use-current-user";

const statusOptions = ["A Fazer", "Em Andamento", "Concluido", "Cancelado"] as const;
const priorityOptions = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Media" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
] as const;

const priorityLabels = Object.fromEntries(priorityOptions.map((priority) => [priority.value, priority.label]));

type ViewMode = "kanban" | "table";
type AppointmentPriority = (typeof priorityOptions)[number]["value"];

type UserOption = {
  id: string;
  name: string;
  email: string;
};

type LeadOption = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  state: string | null;
};

type AppointmentStage = {
  id: string;
  name: string;
  status: string;
  order: number;
};

type AppointmentItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  stageId: string | null;
  priority: AppointmentPriority;
  startsAt: string | null;
  dueAt: string | null;
  leadId: string | null;
  responsibleId: string | null;
  assignedToAll: boolean;
  lead?: LeadOption | null;
  responsible?: UserOption | null;
  stage?: AppointmentStage | null;
};

export function AppointmentBoard() {
  const { data, loading, error, refresh } = useApiResource<AppointmentItem[]>("/api/appointments");
  const leads = useApiResource<LeadOption[]>("/api/leads");
  const users = useApiResource<UserOption[]>("/api/users");
  const stages = useApiResource<AppointmentStage[]>("/api/appointment-stages");
  const currentUser = useCurrentUser();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStageName, setNewStageName] = useState("");

  const appointmentStages = useMemo(() => {
    if (stages.data?.length) return stages.data;
    return statusOptions.map((status, index) => ({ id: status, name: status, status, order: (index + 1) * 10 }));
  }, [stages.data]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return (data ?? []).filter((item) =>
      [item.title, item.description, item.status, item.lead?.name, item.lead?.phone, item.responsible?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, query]);

  const overdue = filtered.filter((item) => item.dueAt && new Date(item.dueAt) < new Date() && item.status !== "Concluido").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = filtered.filter((item) => item.startsAt?.slice(0, 10) === today || item.dueAt?.slice(0, 10) === today).length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const stageId = String(formData.get("stageId") ?? "");
    const selectedStage = appointmentStages.find((stage) => stage.id === stageId);
    const assignMode = String(formData.get("assignMode") ?? "");
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formData.get("title"),
        description: formData.get("description"),
        priority: formData.get("priority"),
        status: selectedStage?.status ?? "A Fazer",
        stageId,
        leadId: formData.get("leadId"),
        responsibleId: assignMode === "__me" ? currentUser.data?.id : formData.get("responsibleId"),
        assignedToAll: assignMode === "__all",
        startsAt: formData.get("startsAt"),
        dueAt: formData.get("dueAt"),
      }),
    });
    if (response.ok) {
      form.reset();
      setShowCreateModal(false);
      await refresh();
    }
    setSaving(false);
  }

  async function updateAppointment(id: string, payload: Partial<AppointmentItem>) {
    await fetch(`/api/appointments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refresh();
  }

  async function deleteAppointment(id: string) {
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function createStage() {
    const name = newStageName.trim();
    if (!name) return;
    const response = await fetch("/api/appointment-stages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setNewStageName("");
      await stages.refresh();
    }
  }

  async function updateStage(id: string, name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const response = await fetch(`/api/appointment-stages/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName }),
    });
    if (response.ok) await stages.refresh();
  }

  async function deleteStage(id: string) {
    const response = await fetch(`/api/appointment-stages/${id}`, { method: "DELETE" });
    if (response.ok) await Promise.all([stages.refresh(), refresh()]);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto]">
          <Button type="button" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Cadastrar Compromisso
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Pesquisar compromisso, lead ou responsavel"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex rounded-md border bg-background p-1">
            <Button
              aria-label="Visualizar kanban"
              size="sm"
              type="button"
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              onClick={() => setViewMode("kanban")}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              aria-label="Visualizar tabela"
              size="sm"
              type="button"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Compromissos" value={filtered.length.toString()} />
          <Metric label="Hoje" value={todayCount.toString()} />
          <Metric label="Atrasados" value={overdue.toString()} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {viewMode === "kanban" ? (
          <KanbanView
            appointments={filtered}
            loading={loading}
            users={users.data ?? []}
            currentUserId={currentUser.data?.id ?? ""}
            leads={leads.data ?? []}
            stages={appointmentStages}
            newStageName={newStageName}
            onNewStageNameChange={setNewStageName}
            onCreateStage={createStage}
            onUpdateStage={updateStage}
            onDeleteStage={deleteStage}
            onUpdate={updateAppointment}
            onDelete={deleteAppointment}
          />
        ) : (
          <TableView
            appointments={filtered}
            loading={loading}
            users={users.data ?? []}
            currentUserId={currentUser.data?.id ?? ""}
            leads={leads.data ?? []}
            stages={appointmentStages}
            onUpdate={updateAppointment}
            onDelete={deleteAppointment}
          />
        )}
      </div>
      <AppointmentCreateModal
        open={showCreateModal}
        saving={saving}
        stages={appointmentStages}
        users={users.data ?? []}
        currentUserId={currentUser.data?.id ?? ""}
        leads={leads.data ?? []}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function AppointmentCreateModal({
  open,
  saving,
  stages,
  users,
  currentUserId,
  leads,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  stages: AppointmentStage[];
  users: UserOption[];
  currentUserId: string;
  leads: LeadOption[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Novo compromisso</p>
            <h2 className="text-xl font-semibold">Cadastrar Compromisso</h2>
          </div>
          <Button aria-label="Fechar cadastro" size="sm" variant="ghost" type="button" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <form className="flex-1 space-y-3 overflow-auto p-5" onSubmit={onSubmit}>
          <Input name="title" placeholder="Titulo" required />
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" name="stageId" defaultValue="">
            <option value="">Etapa</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" name="priority" defaultValue="MEDIUM">
            {priorityOptions.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" name="leadId" defaultValue="">
            <option value="">Lead vinculado</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.name} - {lead.phone}
              </option>
            ))}
          </select>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" name="assignMode" defaultValue="__me">
            <option value="__me">Atribuir só a mim</option>
            <option value="__all">Atribuir para todos</option>
            <option value="">Escolher funcionario</option>
          </select>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" name="responsibleId" defaultValue={currentUserId}>
            <option value="">Responsavel</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <Input name="startsAt" type="datetime-local" />
            <Input name="dueAt" type="datetime-local" />
          </div>
          <Textarea name="description" placeholder="Descricao" />
          <Button className="w-full" disabled={saving} type="submit">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando" : "Cadastrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function KanbanView({
  appointments,
  loading,
  users,
  currentUserId,
  leads,
  stages,
  newStageName,
  onNewStageNameChange,
  onCreateStage,
  onUpdateStage,
  onDeleteStage,
  onUpdate,
  onDelete,
}: {
  appointments: AppointmentItem[];
  loading: boolean;
  users: UserOption[];
  currentUserId: string;
  leads: LeadOption[];
  stages: AppointmentStage[];
  newStageName: string;
  onNewStageNameChange: (value: string) => void;
  onCreateStage: () => Promise<void>;
  onUpdateStage: (id: string, name: string) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
  onUpdate: (id: string, payload: Partial<AppointmentItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-w-max items-start gap-3">
      {stages.map((column) => {
        const columnAppointments = appointments.filter((item) =>
          item.stageId ? item.stageId === column.id : item.status === column.status,
        );
        return (
          <Card
            key={column.id}
            className="min-h-[520px] w-[292px] shrink-0 border-none bg-muted/80 shadow-sm"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const appointmentId = event.dataTransfer.getData("text/plain");
              if (appointmentId) void onUpdate(appointmentId, { stageId: column.id });
            }}
          >
            <CardHeader className="p-3 pb-2">
              <StageHeader
                stage={column}
                count={columnAppointments.length}
                onUpdateStage={onUpdateStage}
                onDeleteStage={onDeleteStage}
              />
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-310px)] space-y-2 overflow-y-auto p-3 pt-0">
              {loading ? (
                <EmptyState text="Carregando" />
              ) : columnAppointments.length ? (
                columnAppointments.map((item) => (
                  <AppointmentCard
                    key={item.id}
                    appointment={item}
                    users={users}
                    currentUserId={currentUserId}
                    leads={leads}
                    stages={stages}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))
              ) : (
                <EmptyState text="Sem compromissos" />
              )}
            </CardContent>
          </Card>
        );
      })}
        <div className="w-[292px] shrink-0 rounded-md bg-muted/70 p-3 shadow-sm">
          <div className="space-y-2">
            <Input
              placeholder="Adicionar uma lista..."
              value={newStageName}
              onChange={(event) => onNewStageNameChange(event.target.value)}
            />
            <Button className="w-full justify-start" type="button" variant="outline" onClick={onCreateStage}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Criar Etapa
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TableView({
  appointments,
  loading,
  users,
  currentUserId,
  leads,
  stages,
  onUpdate,
  onDelete,
}: {
  appointments: AppointmentItem[];
  loading: boolean;
  users: UserOption[];
  currentUserId: string;
  leads: LeadOption[];
  stages: AppointmentStage[];
  onUpdate: (id: string, payload: Partial<AppointmentItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  if (loading) return <EmptyState text="Carregando compromissos" />;

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Compromisso</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Prioridade</th>
              <th className="px-3 py-3 font-medium">Lead</th>
              <th className="px-3 py-3 font-medium">Responsavel</th>
              <th className="px-3 py-3 font-medium">Prazo</th>
              <th className="px-3 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {appointments.length ? (
              appointments.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.description ?? "Sem descricao"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <StageSelect
                      value={item.stageId ?? ""}
                      stages={stages}
                      fallbackStatus={item.status}
                      onChange={(stageId) => onUpdate(item.id, { stageId })}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <PrioritySelect
                      value={item.priority}
                      onChange={(priority) => onUpdate(item.id, { priority })}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <LeadSelect value={item.leadId ?? ""} leads={leads} onChange={(leadId) => onUpdate(item.id, { leadId })} />
                  </td>
                  <td className="px-3 py-3">
                    <UserSelect
                      value={item.assignedToAll ? "__all" : item.responsibleId ?? ""}
                      users={users}
                      currentUserId={currentUserId}
                      onChange={(responsibleId) =>
                        onUpdate(item.id, buildAssignmentPayload(responsibleId, currentUserId))
                      }
                    />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(item.dueAt) || "Sem prazo"}</td>
                  <td className="px-3 py-3 text-right">
                    <Button aria-label="Excluir compromisso" size="sm" variant="destructive" type="button" onClick={() => onDelete(item.id)}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  Nenhum compromisso encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StageHeader({
  stage,
  count,
  onUpdateStage,
  onDeleteStage,
}: {
  stage: AppointmentStage;
  count: number;
  onUpdateStage: (id: string, name: string) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);

  async function save() {
    await onUpdateStage(stage.id, name);
    setEditing(false);
  }

  return (
    <CardTitle className="flex items-center justify-between gap-2 text-sm">
      {editing ? (
        <Input className="h-8" value={name} onChange={(event) => setName(event.target.value)} />
      ) : (
        <span className="truncate font-semibold">{stage.name}</span>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        {editing ? (
          <Button aria-label="Salvar etapa" size="sm" variant="ghost" type="button" onClick={save}>
            <Check className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button aria-label="Editar etapa" size="sm" variant="ghost" type="button" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        <Button aria-label="Excluir etapa" size="sm" variant="ghost" type="button" onClick={() => onDeleteStage(stage.id)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </CardTitle>
  );
}

function AppointmentCard({
  appointment,
  users,
  currentUserId,
  leads,
  stages,
  onUpdate,
  onDelete,
}: {
  appointment: AppointmentItem;
  users: UserOption[];
  currentUserId: string;
  leads: LeadOption[];
  stages: AppointmentStage[];
  onUpdate: (id: string, payload: Partial<AppointmentItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div
      className="rounded-md bg-background p-3 text-sm shadow-sm transition-shadow hover:shadow-md"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", appointment.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{appointment.title}</p>
          <span className="mt-1 inline-flex rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: priorityColor(appointment.priority) }}>
            {priorityLabels[appointment.priority]}
          </span>
        </div>
        <Button aria-label="Excluir compromisso" size="sm" variant="ghost" type="button" onClick={() => onDelete(appointment.id)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>{appointment.lead?.name ?? "Sem lead vinculado"}</p>
        <p>{appointment.assignedToAll ? "Todos" : appointment.responsible?.name ?? "Sem responsavel"}</p>
        <p className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDate(appointment.dueAt) || formatDate(appointment.startsAt) || "Sem data"}
        </p>
      </div>
      <div className="mt-3 space-y-2">
        <StageSelect
          value={appointment.stageId ?? ""}
          stages={stages}
          fallbackStatus={appointment.status}
          onChange={(stageId) => onUpdate(appointment.id, { stageId })}
        />
        <PrioritySelect value={appointment.priority} onChange={(priority) => onUpdate(appointment.id, { priority })} />
        <LeadSelect value={appointment.leadId ?? ""} leads={leads} onChange={(leadId) => onUpdate(appointment.id, { leadId })} />
        <UserSelect
          value={appointment.assignedToAll ? "__all" : appointment.responsibleId ?? ""}
          users={users}
          currentUserId={currentUserId}
          onChange={(responsibleId) =>
            onUpdate(appointment.id, buildAssignmentPayload(responsibleId, currentUserId))
          }
        />
      </div>
    </div>
  );
}

function StageSelect({
  value,
  stages,
  fallbackStatus,
  onChange,
}: {
  value: string;
  stages: AppointmentStage[];
  fallbackStatus?: string;
  onChange: (value: string) => void;
}) {
  const fallbackStage = !value && fallbackStatus ? stages.find((stage) => stage.status === fallbackStatus) : null;
  return (
    <select
      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      value={value || fallbackStage?.id || ""}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Sem etapa</option>
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>
          {stage.name}
        </option>
      ))}
    </select>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
      {statusOptions.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: AppointmentPriority;
  onChange: (value: AppointmentPriority) => void;
}) {
  return (
    <select
      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      value={value}
      onChange={(event) => onChange(event.target.value as AppointmentPriority)}
    >
      {priorityOptions.map((priority) => (
        <option key={priority.value} value={priority.value}>
          {priority.label}
        </option>
      ))}
    </select>
  );
}

function LeadSelect({ value, leads, onChange }: { value: string; leads: LeadOption[]; onChange: (value: string) => void }) {
  return (
    <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Sem lead</option>
      {leads.map((lead) => (
        <option key={lead.id} value={lead.id}>
          {lead.name}
        </option>
      ))}
    </select>
  );
}

function UserSelect({
  value,
  users,
  currentUserId,
  onChange,
}: {
  value: string;
  users: UserOption[];
  currentUserId: string;
  onChange: (value: string) => void;
}) {
  const hasCurrentUser = Boolean(currentUserId);
  return (
    <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Sem responsavel</option>
      <option value="__me" disabled={!hasCurrentUser}>Só a mim</option>
      <option value="__all">Todos</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed bg-background/60 p-4 text-center text-sm text-muted-foreground">{text}</div>;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityColor(priority: AppointmentPriority) {
  const colors: Record<AppointmentPriority, string> = {
    LOW: "#22c55e",
    MEDIUM: "#0ea5e9",
    HIGH: "#f59e0b",
    URGENT: "#ef4444",
  };
  return colors[priority];
}

function buildAssignmentPayload(value: string, currentUserId: string): Partial<AppointmentItem> {
  if (value === "__all") {
    return { responsibleId: "", assignedToAll: true };
  }

  if (value === "__me") {
    return { responsibleId: currentUserId, assignedToAll: false };
  }

  return { responsibleId: value, assignedToAll: false };
}
