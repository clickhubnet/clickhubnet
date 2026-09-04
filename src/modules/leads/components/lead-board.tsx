"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarClock, Check, Clipboard, Download, Eye, LayoutGrid, List, MessageCircle, MessageSquareText, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";
import type { ApiResult } from "@/types/api";

const statusOptions = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contato" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "PROPOSAL", label: "Proposta" },
  { value: "WON", label: "Fechado" },
  { value: "LOST", label: "Perdido" },
] as const;

const statusMap = Object.fromEntries(statusOptions.map((status) => [status.value, status.label]));

type LeadStatus = (typeof statusOptions)[number]["value"];

type UserOption = {
  id: string;
  name: string;
  email: string;
};

type PlanOption = {
  id: string;
  name: string;
  speed: string;
  price: string | number;
  active: boolean;
};

type LeadStage = {
  id: string;
  name: string;
  status: LeadStatus;
  order: number;
};

type LeadListItem = {
  id: string;
  customerCode: string;
  name: string;
  phone: string;
  email: string | null;
  cpfCnpj: string | null;
  birthDate: string | null;
  cep: string | null;
  address: string | null;
  streetNumber: string | null;
  complement: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  status: LeadStatus;
  kanbanStageId: string | null;
  source: string;
  notes: string | null;
  expectedValue: string | number | null;
  planName: string | null;
  planValue: string | number | null;
  billingDueDay: number | null;
  assignedUserId: string | null;
  planId: string | null;
  createdAt?: string;
  assignedUser?: UserOption | null;
  plan?: PlanOption | null;
  kanbanStage?: LeadStage | null;
};

type LeadDetail = LeadListItem & {
  createdAt: string;
  updatedAt: string;
  appointments: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    startsAt: string | null;
    dueAt: string | null;
    responsible: UserOption | null;
  }>;
  conversations: Array<{
    id: string;
    phone: string;
    state: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      direction: string;
      body: string;
      createdAt: string;
    }>;
  }>;
};

type ViewMode = "kanban" | "table";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function LeadBoard() {
  const searchParams = useSearchParams();
  const { data, loading, error, refresh } = useApiResource<LeadListItem[]>("/api/leads");
  const users = useApiResource<UserOption[]>("/api/users");
  const plans = useApiResource<PlanOption[]>("/api/plans");
  const stages = useApiResource<LeadStage[]>("/api/lead-stages");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const activePlans = useMemo(() => (plans.data ?? []).filter((plan) => plan.active), [plans.data]);
  const kanbanStages = useMemo(() => {
    if (stages.data?.length) {
      return stages.data;
    }
    return statusOptions.map((status, index) => ({
      id: status.value,
      name: status.label,
      status: status.value,
      order: (index + 1) * 10,
    }));
  }, [stages.data]);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    const createdFilter = searchParams.get("created");
    const today = new Date().toISOString().slice(0, 10);

    return (data ?? []).filter((lead) =>
      (!statusFilter || lead.status === statusFilter || lead.kanbanStageId === statusFilter) &&
      (!createdFilter || createdFilter !== "today" || lead.createdAt?.slice(0, 10) === today) &&
      [
        lead.name,
        lead.phone,
        lead.email,
        lead.cpfCnpj,
        lead.cep,
        lead.city,
        lead.state,
        lead.plan?.name,
        lead.assignedUser?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [data, query, searchParams, statusFilter]);

  const totalPipeline = useMemo(
    () => filtered.reduce((sum, lead) => sum + Number(lead.expectedValue ?? 0), 0),
    [filtered],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        phone: formData.get("phone"),
        email: formData.get("email"),
        cpfCnpj: formData.get("cpfCnpj"),
        birthDate: formData.get("birthDate"),
        cep: formData.get("cep"),
        address: formData.get("address"),
        streetNumber: formData.get("streetNumber"),
        complement: formData.get("complement"),
        neighborhood: formData.get("neighborhood"),
        city: formData.get("city"),
        state: formData.get("state"),
        planId: formData.get("planId"),
        planName: formData.get("planName"),
        planValue: formData.get("planValue"),
        billingDueDay: formData.get("billingDueDay"),
        assignedUserId: formData.get("assignedUserId"),
        expectedValue: formData.get("expectedValue"),
        notes: formData.get("notes"),
        source: "manual",
      }),
    });
    const result = (await response.json()) as ApiResult<LeadListItem>;
    if (result.status === "success") {
      form.reset();
      setShowCreateModal(false);
      await refresh();
    }
    setSaving(false);
  }

  async function updateLead(id: string, payload: Partial<LeadListItem>) {
    const response = await fetch(`/api/leads/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      window.dispatchEvent(new Event("crm:dashboard-refresh"));
      await refresh();
    }
  }

  async function refreshAll() {
    await Promise.all([refresh(), users.refresh(), plans.refresh(), stages.refresh()]);
  }

  async function createStage() {
    const name = newStageName.trim();
    if (!name) return;
    const response = await fetch("/api/lead-stages", {
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
    const response = await fetch(`/api/lead-stages/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cleanName }),
    });
    if (response.ok) {
      await stages.refresh();
    }
  }

  async function deleteStage(id: string) {
    const response = await fetch(`/api/lead-stages/${id}`, { method: "DELETE" });
    if (response.ok) {
      await Promise.all([stages.refresh(), refresh()]);
    }
  }

  async function saveLeadDetails(id: string, payload: Partial<LeadListItem>) {
    await updateLead(id, payload);
    await openLeadDetails(id);
  }

  async function deleteLead(id: string) {
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    if (detail?.id === id) {
      setDetail(null);
    }
    await refresh();
  }

  async function openLeadDetails(id: string) {
    setDetailLoading(true);
    const response = await fetch(`/api/leads/${id}`);
    const result = (await response.json()) as ApiResult<LeadDetail>;
    if (result.status === "success") {
      setDetail(result.data);
    }
    setDetailLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[auto_1fr_auto_auto_auto]">
          <Button type="button" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Cadastrar Lead Avulso
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Pesquisar por nome, WhatsApp, CEP, plano ou responsavel"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Todos os status</option>
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
            {kanbanStages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
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
          <Button variant="outline" type="button" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </Button>
          <Button asChild variant="outline" type="button">
            <a href="/api/leads/export">
              <Download className="h-4 w-4" aria-hidden="true" />
              Exportar XLSX
            </a>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Total de Leads Cadastrados" value={(data?.length ?? 0).toString()} />
          <Metric label="Pipeline estimado" value={currencyFormatter.format(totalPipeline)} />
          <Metric label="Fechados" value={filtered.filter((lead) => lead.status === "WON").length.toString()} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {users.error || plans.error ? (
          <p className="text-sm text-muted-foreground">Algumas opcoes auxiliares nao foram carregadas.</p>
        ) : null}

        {viewMode === "kanban" ? (
          <KanbanView
            leads={filtered}
            loading={loading}
            users={users.data ?? []}
            plans={activePlans}
            stages={kanbanStages}
            newStageName={newStageName}
            onNewStageNameChange={setNewStageName}
            onCreateStage={createStage}
            onUpdateStage={updateStage}
            onDeleteStage={deleteStage}
            onUpdate={updateLead}
            onDelete={deleteLead}
            onOpenDetails={openLeadDetails}
          />
        ) : (
          <TableView
            leads={filtered}
            loading={loading}
            users={users.data ?? []}
            plans={activePlans}
            stages={kanbanStages}
            onUpdate={updateLead}
            onDelete={deleteLead}
            onOpenDetails={openLeadDetails}
          />
        )}
      </div>
      <LeadCreateModal
        open={showCreateModal}
        saving={saving}
        users={users.data ?? []}
        plans={activePlans}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleSubmit}
      />
      <LeadDetailPanel
        lead={detail}
        loading={detailLoading}
        users={users.data ?? []}
        plans={activePlans}
        stages={kanbanStages}
        onClose={() => setDetail(null)}
        onSave={saveLeadDetails}
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

function KanbanView({
  leads,
  loading,
  users,
  plans,
  stages,
  newStageName,
  onNewStageNameChange,
  onCreateStage,
  onUpdateStage,
  onDeleteStage,
  onUpdate,
  onDelete,
  onOpenDetails,
}: {
  leads: LeadListItem[];
  loading: boolean;
  users: UserOption[];
  plans: PlanOption[];
  stages: LeadStage[];
  newStageName: string;
  onNewStageNameChange: (value: string) => void;
  onCreateStage: () => Promise<void>;
  onUpdateStage: (id: string, name: string) => Promise<void>;
  onDeleteStage: (id: string) => Promise<void>;
  onUpdate: (id: string, payload: Partial<LeadListItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenDetails: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row">
        <Input
          placeholder="Nova etapa do Kanban"
          value={newStageName}
          onChange={(event) => onNewStageNameChange(event.target.value)}
        />
        <Button type="button" variant="outline" onClick={onCreateStage}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Criar Etapa
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {stages.map((column) => {
        const columnLeads = leads.filter((lead) =>
          lead.kanbanStageId ? lead.kanbanStageId === column.id : lead.status === column.status,
        );
        return (
          <Card
            key={column.id}
            className="min-h-72"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const leadId = event.dataTransfer.getData("text/plain");
              if (leadId) void onUpdate(leadId, { kanbanStageId: column.id });
            }}
          >
            <CardHeader className="p-4">
              <StageHeader
                stage={column}
                count={columnLeads.length}
                onUpdateStage={onUpdateStage}
                onDeleteStage={onDeleteStage}
              />
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {loading ? (
                <EmptyState text="Carregando" />
              ) : columnLeads.length ? (
                columnLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    users={users}
                    plans={plans}
                    stages={stages}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onOpenDetails={onOpenDetails}
                  />
                ))
              ) : (
                <EmptyState text="Sem leads" />
              )}
            </CardContent>
          </Card>
        );
      })}
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
  stage: LeadStage;
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
        <span className="truncate">{stage.name}</span>
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

function TableView({
  leads,
  loading,
  users,
  plans,
  stages,
  onUpdate,
  onDelete,
  onOpenDetails,
}: {
  leads: LeadListItem[];
  loading: boolean;
  users: UserOption[];
  plans: PlanOption[];
  stages: LeadStage[];
  onUpdate: (id: string, payload: Partial<LeadListItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenDetails: (id: string) => Promise<void>;
}) {
  if (loading) {
    return <EmptyState text="Carregando leads" />;
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Nome do cliente</th>
              <th className="px-3 py-3 font-medium">Contato</th>
              <th className="px-3 py-3 font-medium">Cidade</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Plano</th>
              <th className="px-3 py-3 font-medium">Atribuido</th>
              <th className="px-3 py-3 font-medium">Data</th>
              <th className="px-3 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.length ? (
              leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium">{lead.name}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{lead.phone}</td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    <p>{[lead.city, lead.state].filter(Boolean).join(" / ") || "Sem cidade"}</p>
                  </td>
                  <td className="px-3 py-3">
                    <StageSelect
                      value={lead.kanbanStageId ?? ""}
                      stages={stages}
                      fallbackStatus={lead.status}
                      onChange={(kanbanStageId) => onUpdate(lead.id, { kanbanStageId })}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <PlanSelect
                      value={lead.planId ?? ""}
                      plans={plans}
                      onChange={(planId) => onUpdate(lead.id, buildPlanPayload(planId, plans))}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <UserSelect
                      value={lead.assignedUserId ?? ""}
                      users={users}
                      onChange={(assignedUserId) => onUpdate(lead.id, { assignedUserId })}
                    />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDateTime(lead.createdAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <WhatsAppButton phone={lead.phone} />
                      <Button
                        aria-label="Ver detalhes do lead"
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => onOpenDetails(lead.id)}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label="Excluir lead"
                        size="sm"
                        variant="destructive"
                        type="button"
                        onClick={() => onDelete(lead.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={7}>
                  Nenhum lead encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  users,
  plans,
  stages,
  onUpdate,
  onDelete,
  onOpenDetails,
}: {
  lead: LeadListItem;
  users: UserOption[];
  plans: PlanOption[];
  stages: LeadStage[];
  onUpdate: (id: string, payload: Partial<LeadListItem>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenDetails: (id: string) => Promise<void>;
}) {
  return (
    <div
      className="rounded-md border bg-background p-3 text-sm"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", lead.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{lead.name}</p>
          <p className="text-muted-foreground">{lead.phone}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <WhatsAppButton phone={lead.phone} compact />
          <Button
            aria-label="Ver detalhes do lead"
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => onOpenDetails(lead.id)}
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            aria-label="Excluir lead"
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => onDelete(lead.id)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p>{lead.planName ?? lead.plan?.name ?? "Sem plano definido"}</p>
        <p>{lead.assignedUser?.name ?? "Sem responsavel"}</p>
        <p>{[lead.city, lead.state].filter(Boolean).join(" / ") || lead.cep || "Sem localizacao"}</p>
        <p>{currencyFormatter.format(Number(lead.expectedValue ?? 0))}</p>
      </div>
      <div className="mt-3 space-y-2">
        <StageSelect
          value={lead.kanbanStageId ?? ""}
          stages={stages}
          fallbackStatus={lead.status}
          onChange={(kanbanStageId) => onUpdate(lead.id, { kanbanStageId })}
        />
        <PlanSelect value={lead.planId ?? ""} plans={plans} onChange={(planId) => onUpdate(lead.id, buildPlanPayload(planId, plans))} />
        <UserSelect
          value={lead.assignedUserId ?? ""}
          users={users}
          onChange={(assignedUserId) => onUpdate(lead.id, { assignedUserId })}
        />
      </div>
    </div>
  );
}

function LeadCreateModal({
  open,
  saving,
  users,
  plans,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  users: UserOption[];
  plans: PlanOption[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Cadastro avulso</p>
            <h2 className="text-xl font-semibold">Novo Lead</h2>
          </div>
          <Button aria-label="Fechar cadastro" size="sm" variant="ghost" type="button" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <form className="flex-1 space-y-4 overflow-auto p-5" onSubmit={onSubmit}>
          <LeadFields users={users} plans={plans} />
          <Button className="w-full" disabled={saving} type="submit">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando" : "Cadastrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function LeadEditForm({
  lead,
  users,
  plans,
  stages,
  onSave,
}: {
  lead: LeadDetail;
  users: UserOption[];
  plans: PlanOption[];
  stages: LeadStage[];
  onSave: (id: string, payload: Partial<LeadListItem>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onSave(lead.id, readLeadForm(new FormData(event.currentTarget)));
    setSaving(false);
  }

  return (
    <section className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Dados do Lead</h3>
          <p className="text-xs text-muted-foreground">ID do cliente: {lead.customerCode}</p>
        </div>
        <span className="text-xs text-muted-foreground">Chegou em {formatDateTime(lead.createdAt)}</span>
      </div>
      <form className="mt-4 space-y-4" onSubmit={handleSave}>
        <LeadFields lead={lead} users={users} plans={plans} stages={stages} />
        <Button disabled={saving} type="submit">
          {saving ? "Salvando" : "Salvar Alteracoes"}
        </Button>
      </form>
    </section>
  );
}

function LeadFields({
  lead,
  users,
  plans,
  stages,
}: {
  lead?: Partial<LeadListItem>;
  users: UserOption[];
  plans: PlanOption[];
  stages?: LeadStage[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="name" placeholder="Nome completo" defaultValue={lead?.name ?? ""} required />
        <Input name="phone" placeholder="WhatsApp" defaultValue={lead?.phone ?? ""} required />
        <Input name="email" placeholder="E-mail" type="email" defaultValue={lead?.email ?? ""} />
        <Input name="cpfCnpj" placeholder="CPF" defaultValue={lead?.cpfCnpj ?? ""} />
        <Input name="birthDate" placeholder="Data de nascimento" type="date" defaultValue={formatDateInput(lead?.birthDate)} />
        <Input name="billingDueDay" placeholder="Dia de vencimento" type="number" min="1" max="31" defaultValue={lead?.billingDueDay ?? ""} />
      </div>

      {stages?.length ? (
        <StageSelect
          className="h-10 text-sm"
          value={lead?.kanbanStageId ?? ""}
          stages={stages}
          fallbackStatus={lead?.status}
          name="kanbanStageId"
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="address" placeholder="Nome da rua" defaultValue={lead?.address ?? ""} />
        <Input name="streetNumber" placeholder="Numero" defaultValue={lead?.streetNumber ?? ""} />
        <Input name="complement" placeholder="Complemento" defaultValue={lead?.complement ?? ""} />
        <Input name="neighborhood" placeholder="Bairro" defaultValue={lead?.neighborhood ?? ""} />
        <Input name="city" placeholder="Cidade" defaultValue={lead?.city ?? ""} />
        <Input name="state" placeholder="Estado" maxLength={2} defaultValue={lead?.state ?? ""} />
        <Input name="cep" placeholder="CEP" defaultValue={lead?.cep ?? ""} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          name="planId"
          defaultValue={lead?.planId ?? ""}
        >
          <option value="">Plano</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} - {plan.speed}
            </option>
          ))}
        </select>
        <Input name="planName" placeholder="Nome do plano" defaultValue={lead?.planName ?? lead?.plan?.name ?? ""} />
        <Input name="planValue" placeholder="Valor do plano" type="number" min="0" step="0.01" defaultValue={Number(lead?.planValue ?? lead?.expectedValue ?? lead?.plan?.price ?? 0)} />
        <Input name="expectedValue" placeholder="Valor estimado" type="number" min="0" step="0.01" defaultValue={Number(lead?.expectedValue ?? lead?.planValue ?? 0)} />
      </div>

      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        name="assignedUserId"
        defaultValue={lead?.assignedUserId ?? ""}
      >
        <option value="">Funcionario atribuido</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
      <Textarea name="notes" placeholder="Observacao" defaultValue={lead?.notes ?? ""} />
    </div>
  );
}

function LeadDetailPanel({
  lead,
  loading,
  users,
  plans,
  stages,
  onClose,
  onSave,
}: {
  lead: LeadDetail | null;
  loading: boolean;
  users: UserOption[];
  plans: PlanOption[];
  stages: LeadStage[];
  onClose: () => void;
  onSave: (id: string, payload: Partial<LeadListItem>) => Promise<void>;
}) {
  const [copiedConsultation, setCopiedConsultation] = useState(false);

  if (!lead && !loading) {
    return null;
  }

  async function copyConsultationAddress() {
    if (!lead) return;
    const value = buildConsultationAddress(lead);
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedConsultation(true);
    window.setTimeout(() => setCopiedConsultation(false), 1800);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div className="min-w-0">
            <p className="text-xs uppercase text-muted-foreground">Detalhes do lead</p>
            <h2 className="truncate text-xl font-semibold">{lead?.name ?? "Carregando"}</h2>
            <p className="text-sm text-muted-foreground">{lead?.phone ?? "Buscando informacoes"}</p>
          </div>
          <Button aria-label="Fechar detalhes" size="sm" variant="ghost" type="button" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {loading ? (
            <EmptyState text="Carregando detalhes" />
          ) : lead ? (
            <>
              <LeadEditForm lead={lead} users={users} plans={plans} stages={stages} onSave={onSave} />

              <section className="rounded-md border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide">Copiar para consulta</h3>
                  <Button size="sm" variant="outline" type="button" onClick={() => void copyConsultationAddress()} disabled={!buildConsultationAddress(lead)}>
                    <Clipboard className="h-4 w-4" aria-hidden="true" />
                    {copiedConsultation ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <Textarea
                  className="mt-3 min-h-28 resize-none text-sm"
                  value={buildConsultationAddress(lead)}
                  readOnly
                  placeholder="Endereço completo com CEP aparecerá aqui quando estiver preenchido."
                />
              </section>

              <section className="rounded-md border p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  Compromissos Vinculados
                </h3>
                <div className="mt-3 space-y-2">
                  {lead.appointments.length ? (
                    lead.appointments.map((appointment) => (
                      <div key={appointment.id} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <strong>{appointment.title}</strong>
                          <span className="text-xs text-muted-foreground">{appointment.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {appointment.responsible?.name ?? "Sem responsavel"} -{" "}
                          {formatDateTime(appointment.startsAt ?? appointment.dueAt)}
                        </p>
                        {appointment.description ? <p className="mt-2 text-sm">{appointment.description}</p> : null}
                      </div>
                    ))
                  ) : (
                    <EmptyState text="Nenhum compromisso vinculado" />
                  )}
                </div>
              </section>

              <section className="rounded-md border p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                  Conversas da Lily
                </h3>
                <div className="mt-3 space-y-3">
                  {lead.conversations.length ? (
                    lead.conversations.map((conversation) => (
                      <div key={conversation.id} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <strong>{conversation.phone}</strong>
                          <span className="text-xs text-muted-foreground">{conversation.state}</span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {conversation.messages.map((message) => (
                            <div key={message.id} className="rounded-md bg-muted p-2 text-sm">
                              <p className="text-xs uppercase text-muted-foreground">
                                {message.direction === "inbound" ? "Cliente" : "Lily"} -{" "}
                                {formatDateTime(message.createdAt)}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState text="Nenhuma conversa vinculada" />
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function buildConsultationAddress(lead: Partial<LeadListItem>) {
  const streetLine = [
    normalizeText(lead.address),
    lead.streetNumber ? `nº ${normalizeText(lead.streetNumber)}` : "",
    normalizeText(lead.complement),
  ].filter(Boolean).join(", ");
  const locationLine = [
    normalizeText(lead.neighborhood),
    normalizeText(lead.city),
    normalizeText(lead.state),
  ].filter(Boolean).join(" - ");
  const cepLine = normalizeCep(lead.cep);
  return [
    streetLine,
    locationLine,
    cepLine ? `CEP: ${cepLine}` : "",
  ].filter(Boolean).join("\n");
}

function normalizeText(value?: string | null) {
  return String(value ?? "").trim();
}

function normalizeCep(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return normalizeText(value);
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function StageSelect({
  value,
  stages,
  fallbackStatus,
  name,
  className = "h-8 text-xs",
  onChange,
}: {
  value: string;
  stages: LeadStage[];
  fallbackStatus?: LeadStatus;
  name?: string;
  className?: string;
  onChange?: (value: string) => void;
}) {
  const fallbackStage = !value && fallbackStatus ? stages.find((stage) => stage.status === fallbackStatus) : null;
  const selectedValue = value || fallbackStage?.id || "";
  return (
    <select
      className={`w-full rounded-md border bg-background px-2 ${className}`}
      name={name}
      {...(onChange ? { value: selectedValue } : { defaultValue: selectedValue })}
      onChange={(event) => onChange?.(event.target.value)}
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

function StatusSelect({ value, onChange }: { value: LeadStatus; onChange: (value: LeadStatus) => void }) {
  return (
    <select
      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      value={value}
      onChange={(event) => onChange(event.target.value as LeadStatus)}
    >
      {statusOptions.map((status) => (
        <option key={status.value} value={status.value}>
          {statusMap[status.value]}
        </option>
      ))}
    </select>
  );
}

function PlanSelect({
  value,
  plans,
  onChange,
}: {
  value: string;
  plans: PlanOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Sem plano</option>
      {plans.map((plan) => (
        <option key={plan.id} value={plan.id}>
          {plan.name}
        </option>
      ))}
    </select>
  );
}

function UserSelect({
  value,
  users,
  onChange,
}: {
  value: string;
  users: UserOption[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="h-8 w-full rounded-md border bg-background px-2 text-xs"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Sem responsavel</option>
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </select>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function WhatsAppButton({ phone, compact = false }: { phone?: string | null; compact?: boolean }) {
  const href = buildWhatsAppUrl(phone);

  if (!href) {
    return (
      <Button
        aria-label="WhatsApp indisponivel"
        size="sm"
        variant={compact ? "ghost" : "outline"}
        type="button"
        disabled
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      asChild
      aria-label="Abrir conversa no WhatsApp"
      size="sm"
      variant={compact ? "ghost" : "outline"}
      type="button"
    >
      <a href={href} target="_blank" rel="noreferrer">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
      </a>
    </Button>
  );
}

function buildWhatsAppUrl(phone?: string | null) {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (!digits) return "";

  // Remove dialing prefixes and trunk zeroes from local formats.
  digits = digits.replace(/^00/, "");
  digits = digits.replace(/^0+/, "");

  // Normalize to BR international format.
  if (digits.startsWith("55")) {
    if (digits.length < 12 || digits.length > 13) return "";
  } else if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  } else {
    return "";
  }

  const normalized = digits;
  return `https://wa.me/${normalized}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sem data";
  }
  return new Date(value).toLocaleString("pt-BR");
}

function formatDateInput(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function readLeadForm(formData: FormData): Partial<LeadListItem> {
  return {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    cpfCnpj: String(formData.get("cpfCnpj") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    cep: String(formData.get("cep") ?? ""),
    address: String(formData.get("address") ?? ""),
    streetNumber: String(formData.get("streetNumber") ?? ""),
    complement: String(formData.get("complement") ?? ""),
    neighborhood: String(formData.get("neighborhood") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    kanbanStageId: String(formData.get("kanbanStageId") ?? ""),
    planId: String(formData.get("planId") ?? ""),
    planName: String(formData.get("planName") ?? ""),
    planValue: Number(formData.get("planValue") || 0),
    expectedValue: Number(formData.get("expectedValue") || formData.get("planValue") || 0),
    billingDueDay: Number(formData.get("billingDueDay") || 0) || undefined,
    assignedUserId: String(formData.get("assignedUserId") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
}

function buildPlanPayload(planId: string, plans: PlanOption[]): Partial<LeadListItem> {
  const plan = plans.find((item) => item.id === planId);
  return {
    planId,
    planName: plan?.name ?? "",
    planValue: plan ? Number(plan.price) : 0,
    expectedValue: plan ? Number(plan.price) : 0,
  };
}
