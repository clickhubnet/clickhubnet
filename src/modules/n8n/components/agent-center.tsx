"use client";

import { FormEvent, ReactNode, useMemo, useState } from "react";
import {
  Bot, BrainCircuit, Check, ChevronRight, CircleDollarSign, GripVertical,
  KeyRound, Pencil, Plus, Save, Search, Trash2, Workflow, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";

type FlowStep = { id: string; title: string; message: string; state: string };
type PlanItem = { id: string; name: string; speed: string; price: string | number; description: string | null; active: boolean; order: number };
type AgentItem = {
  id: string; name: string; gender: "MALE" | "FEMALE"; personality: string; rules: Record<string, unknown>;
  flow: { steps?: FlowStep[] | string[] }; active: boolean; minTypingSeconds: number; maxTypingSeconds: number;
  enableReadReceipt: boolean; enableTyping: boolean; enableReplyDelay: boolean; openAiModel: string | null;
  zapiBaseUrl: string | null; zapiInstanceId: string | null; zapiToken: string | null; zapiClientToken: string | null;
  zapiWhatsappNumber: string | null; plans: PlanItem[];
};
type Tab = "agents" | "plans" | "openai" | "flow";

const defaultSteps: FlowStep[] = [
  { id: "start", state: "START", title: "Entrada Meta Ads", message: "Olá, bom dia/boa tarde/boa noite! Eu sou a {{agente}}. Consultora da Claro, para verificar se na sua região tem cobertura, poderia me informar o CEP da instalação?" },
  { id: "cep", state: "ASK_CEP", title: "Consultar cobertura", message: "Consultar o CEP na base do CRM e complementar endereço com ViaCEP quando necessário. Se não houver cobertura, informar indisponibilidade e finalizar." },
  { id: "street-number", state: "ASK_STREET_NUMBER", title: "Número da residência", message: "Com cobertura confirmada, pedir o número da residência." },
  { id: "complement", state: "ASK_COMPLEMENT", title: "Complemento", message: "Perguntar se há complemento, como casa, apartamento ou bloco." },
  { id: "address-confirm", state: "ASK_ADDRESS_CONFIRM", title: "Confirmação do endereço", message: "Confirmar o endereço completo cadastrado exibindo os botões Sim e Não." },
  { id: "name", state: "ASK_NAME", title: "Nome completo", message: "Com o endereço confirmado, pedir o nome completo do cliente." },
  { id: "choose-plan", state: "CHOOSE_PLAN", title: "Escolha do plano", message: "Mostrar o botão Ver planos e, ao clicar, abrir uma lista clicável com os planos ativos e Globoplay grátis." },
  { id: "document", state: "ASK_DOCUMENT", title: "CPF ou CNPJ", message: "Após a escolha do plano, pedir o CPF ou CNPJ e validar o documento." },
  { id: "birth-date", state: "ASK_BIRTH_DATE", title: "Data de nascimento", message: "Com documento válido, pedir a data de nascimento do cliente." },
  { id: "billing", state: "ASK_BILLING_DUE_DAY", title: "Vencimento", message: "Perguntar o melhor dia para vencimento da fatura: 5, 8, 10, 15, 20 ou 25." },
  { id: "email", state: "ASK_EMAIL", title: "E-mail", message: "Pedir o e-mail para finalizar o cadastro." },
  { id: "confirm", state: "CONFIRM_DATA", title: "Confirmação dos dados", message: "Exibir resumo completo com CEP, nome, documento, nascimento, endereço, e-mail, vencimento e plano. Se estiver correto, criar lead na aba Leads." },
  { id: "finish", state: "FINISHED", title: "Finalização", message: "Perfeito! 🎉 Seus dados foram confirmados. Vou cadastrar aqui, deixa o celular ligado 📱, porque aprovando você receberá uma ligação da nossa central." },
];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AgentCenter() {
  const plans = useApiResource<PlanItem[]>("/api/plans");
  const agents = useApiResource<AgentItem[]>("/api/agents");
  const [tab, setTab] = useState<Tab>("agents");
  const [modal, setModal] = useState<null | "agent" | "plan" | "openai">(null);
  const [editingAgent, setEditingAgent] = useState<AgentItem | null>(null);
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredAgents = useMemo(() => (agents.data ?? []).filter((item) =>
    `${item.name} ${item.personality}`.toLowerCase().includes(query.toLowerCase())), [agents.data, query]);
  const filteredPlans = useMemo(() => (plans.data ?? []).filter((item) =>
    `${item.name} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [plans.data, query]);

  async function request(url: string, method: string, body?: unknown) {
    setSaving(true); setNotice("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    setSaving(false); setNotice(result.message ?? (response.ok ? "Alterações salvas." : "Não foi possível salvar."));
    if (!response.ok) throw new Error(result.message);
    return result;
  }

  async function saveAgent(payload: Record<string, unknown>) {
    await request(editingAgent ? `/api/agents/${editingAgent.id}` : "/api/agents", editingAgent ? "PUT" : "POST", payload);
    await agents.refresh(); setModal(null); setEditingAgent(null);
  }
  async function savePlan(payload: Record<string, unknown>) {
    await request(editingPlan ? `/api/plans/${editingPlan.id}` : "/api/plans", editingPlan ? "PUT" : "POST", payload);
    await plans.refresh(); setModal(null); setEditingPlan(null);
  }
  async function remove(kind: "agents" | "plans", id: string) {
    if (!window.confirm("Deseja realmente excluir este cadastro?")) return;
    await request(`/api/${kind}/${id}`, "DELETE");
    await (kind === "agents" ? agents.refresh() : plans.refresh());
  }

  const tabs = [
    { id: "agents" as const, label: "Agentes", icon: Bot },
    { id: "plans" as const, label: "Planos", icon: CircleDollarSign },
    { id: "openai" as const, label: "OpenAI", icon: BrainCircuit },
    { id: "flow" as const, label: "N8N", icon: Workflow },
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b">
      <div className="flex overflow-x-auto">
        {tabs.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setQuery(""); }}
          className={`flex h-12 items-center gap-2 border-b-2 px-5 text-sm font-medium ${tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          <item.icon className="h-4 w-4" />{item.label}
        </button>)}
      </div>
      {tab === "agents" && <Button size="sm" onClick={() => { setEditingAgent(null); setModal("agent"); }}><Plus className="h-4 w-4" />Cadastrar agente</Button>}
      {tab === "plans" && <Button size="sm" onClick={() => { setEditingPlan(null); setModal("plan"); }}><Plus className="h-4 w-4" />Cadastrar plano</Button>}
      {tab === "openai" && <Button size="sm" variant="outline" onClick={() => setModal("openai")}><KeyRound className="h-4 w-4" />Credenciais OpenAI</Button>}
    </div>

    {notice && <p className="rounded-md border bg-card px-4 py-3 text-sm">{notice}</p>}

    {(tab === "agents" || tab === "plans") && <SearchBox value={query} onChange={setQuery} placeholder={tab === "agents" ? "Pesquisar agentes" : "Pesquisar planos"} />}

    {tab === "agents" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filteredAgents.map((agent) => <AgentCard key={agent.id} agent={agent}
        onEdit={() => { setEditingAgent(agent); setModal("agent"); }} onDelete={() => remove("agents", agent.id)} />)}
      {!filteredAgents.length && <Empty text="Nenhum agente cadastrado" />}
    </div>}

    {tab === "plans" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filteredPlans.map((plan) => <PlanCard key={plan.id} plan={plan}
        onEdit={() => { setEditingPlan(plan); setModal("plan"); }} onDelete={() => remove("plans", plan.id)} />)}
      {!filteredPlans.length && <Empty text="Nenhum plano cadastrado" />}
    </div>}

    {tab === "openai" && <OpenAiPanel agents={agents.data ?? []} onEdit={(agent) => { setEditingAgent(agent); setModal("agent"); }} />}
    {tab === "flow" && <FlowEditor agents={agents.data ?? []} onSave={async (agent, steps) => {
      await request(`/api/agents/${agent.id}`, "PUT", { flow: { steps } }); await agents.refresh();
    }} />}

    {modal === "agent" && <AgentModal agent={editingAgent} plans={plans.data ?? []} saving={saving} onClose={() => setModal(null)} onSave={saveAgent} />}
    {modal === "plan" && <PlanModal plan={editingPlan} saving={saving} onClose={() => setModal(null)} onSave={savePlan} />}
    {modal === "openai" && <OpenAiCredentials saving={saving} onClose={() => setModal(null)} onSave={async (payload) => { await request("/api/settings", "PUT", payload); setModal(null); }} />}
  </div>;
}

function AgentCard({ agent, onEdit, onDelete }: { agent: AgentItem; onEdit: () => void; onDelete: () => void }) {
  return <Card className="overflow-hidden"><CardContent className="p-0">
    <button className="w-full p-5 text-left" onClick={onEdit}>
      <div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/15"><Bot className="h-6 w-6 text-primary" /></div>
        <span className={`rounded-full px-2 py-1 text-xs ${agent.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{agent.active ? "Ativo" : "Inativo"}</span></div>
      <h3 className="mt-4 font-semibold">{agent.name}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{agent.personality}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>{agent.gender === "FEMALE" ? "Feminino" : "Masculino"}</span><span>•</span><span>{agent.plans.length} planos</span><span>•</span><span>{agent.zapiInstanceId ? "Z-API configurada" : "Z-API pendente"}</span></div>
    </button>
    <div className="flex justify-end gap-2 border-t px-4 py-3"><Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</Button><Button size="icon" variant="ghost" aria-label="Excluir agente" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
  </CardContent></Card>;
}

function PlanCard({ plan, onEdit, onDelete }: { plan: PlanItem; onEdit: () => void; onDelete: () => void }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-muted-foreground">Plano</p><h3 className="mt-1 font-semibold">{plan.name}</h3></div><span className={`rounded-full px-2 py-1 text-xs ${plan.active ? "bg-emerald-100 text-emerald-700" : "bg-muted"}`}>{plan.active ? "Ativo" : "Inativo"}</span></div>
    <p className="mt-4 text-2xl font-semibold">{money.format(Number(plan.price))}</p><p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">{plan.description || "Sem descrição"}</p>
    <div className="mt-4 flex justify-end gap-2 border-t pt-3"><Button size="sm" variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</Button><Button size="icon" variant="ghost" aria-label="Excluir plano" onClick={onDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
  </CardContent></Card>;
}

function OpenAiPanel({ agents, onEdit }: { agents: AgentItem[]; onEdit: (agent: AgentItem) => void }) {
  return <div><div className="mb-4"><h2 className="font-semibold">Inteligência dos agentes</h2><p className="text-sm text-muted-foreground">Personalidade, regras e modelo aplicados nas respostas.</p></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => <Card key={agent.id} className="cursor-pointer hover:border-primary/60" onClick={() => onEdit(agent)}><CardContent className="p-5">
      <div className="flex items-center gap-3"><BrainCircuit className="h-6 w-6 text-primary" /><div><h3 className="font-semibold">{agent.name}</h3><p className="text-xs text-muted-foreground">{agent.openAiModel || "Modelo global"}</p></div></div>
      <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">{agent.personality}</p><div className="mt-4 flex items-center justify-between border-t pt-3 text-sm"><span>{Object.keys(agent.rules || {}).length} regras configuradas</span><ChevronRight className="h-4 w-4" /></div>
    </CardContent></Card>)}</div></div>;
}

function FlowEditor({ agents, onSave }: { agents: AgentItem[]; onSave: (agent: AgentItem, steps: FlowStep[]) => Promise<void> }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const selected = agents.find((item) => item.id === agentId) ?? agents[0];
  const [drafts, setDrafts] = useState<Record<string, FlowStep[]>>({});
  const [editing, setEditing] = useState<FlowStep | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  if (!selected) return <Empty text="Cadastre um agente antes de configurar o fluxo" />;
  const steps = drafts[selected.id] ?? normalizeSteps(selected.flow?.steps);
  const setSteps = (next: FlowStep[]) => setDrafts((value) => ({ ...value, [selected.id]: next }));
  function drop(index: number) { if (dragIndex === null || dragIndex === index) return; const next = [...steps]; const [item] = next.splice(dragIndex, 1); next.splice(index, 0, item); setSteps(next); setDragIndex(null); }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Fluxo de mensagens</h2><p className="text-sm text-muted-foreground">Arraste os blocos para alterar a ordem de execução.</p></div><div className="flex gap-2"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={selected.id} onChange={(e) => setAgentId(e.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><Button variant="outline" onClick={() => setEditing({ id: crypto.randomUUID(), state: `CUSTOM_${Date.now()}`, title: "Nova mensagem", message: "" })}><Plus className="h-4 w-4" />Mensagem</Button><Button onClick={() => onSave(selected, steps)}><Save className="h-4 w-4" />Salvar fluxo</Button></div></div>
    <div className="min-h-[510px] overflow-x-auto rounded-md border bg-slate-100 p-8 dark:bg-slate-950"><div className="flex min-w-max items-center py-28">
      {steps.map((step, index) => <div key={step.id} className="flex items-center" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(index)}>
        {index > 0 && <div className="relative h-0.5 w-20 bg-cyan-500"><span className="absolute -right-1 -top-1.5 h-3 w-3 rounded-full border-2 border-cyan-500 bg-white" /></div>}
        <div draggable onDragStart={() => setDragIndex(index)} className="w-64 cursor-grab rounded-md border bg-card shadow-lg active:cursor-grabbing">
          <div className="flex items-center justify-between border-b px-3 py-2"><div className="flex items-center gap-2"><GripVertical className="h-4 w-4 text-muted-foreground" /><span className="text-xs font-medium text-cyan-600">{step.state}</span></div><div className="flex"><button className="p-1" title="Editar mensagem" onClick={() => setEditing(step)}><Pencil className="h-4 w-4" /></button><button className="p-1" title="Excluir mensagem" onClick={() => setSteps(steps.filter((item) => item.id !== step.id))}><Trash2 className="h-4 w-4 text-destructive" /></button></div></div>
          <div className="p-4"><h3 className="font-semibold">{step.title}</h3><p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{step.message}</p></div><div className="border-t px-3 py-2 text-xs text-muted-foreground">Mensagem #{index + 1}</div>
        </div>
      </div>)}
    </div></div>
    {editing && <Modal title={steps.some((item) => item.id === editing.id) ? "Editar mensagem" : "Adicionar mensagem"} onClose={() => setEditing(null)}><form onSubmit={(e) => { e.preventDefault(); const exists = steps.some((item) => item.id === editing.id); setSteps(exists ? steps.map((item) => item.id === editing.id ? editing : item) : [...steps, editing]); setEditing(null); }} className="space-y-3"><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Nome da etapa" required /><Input value={editing.state} onChange={(e) => setEditing({ ...editing, state: e.target.value.toUpperCase().replace(/\s/g, "_") })} placeholder="Código da etapa" required /><Textarea className="min-h-32" value={editing.message} onChange={(e) => setEditing({ ...editing, message: e.target.value })} placeholder="Mensagem enviada ao cliente" required /><Button className="w-full"><Save className="h-4 w-4" />Salvar mensagem</Button></form></Modal>}
  </div>;
}

function AgentModal({ agent, plans, saving, onClose, onSave }: { agent: AgentItem | null; plans: PlanItem[]; saving: boolean; onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [rules, setRules] = useState(() => rulesText(agent?.rules));
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await onSave({
    name: f.get("name"), gender: f.get("gender"), personality: f.get("personality"), rules: textRules(rules), active: f.get("active") === "on",
    minTypingSeconds: Number(f.get("minTypingSeconds") || 2), maxTypingSeconds: Number(f.get("maxTypingSeconds") || 4), openAiModel: f.get("openAiModel"),
    enableReadReceipt: f.get("enableReadReceipt") === "on", enableTyping: f.get("enableTyping") === "on", enableReplyDelay: f.get("enableReplyDelay") === "on",
    zapiBaseUrl: f.get("zapiBaseUrl"), zapiInstanceId: f.get("zapiInstanceId"), zapiToken: f.get("zapiToken"), zapiClientToken: f.get("zapiClientToken"), zapiWhatsappNumber: f.get("zapiWhatsappNumber"),
    planIds: f.getAll("planIds"), flow: agent?.flow?.steps ? agent.flow : { steps: defaultSteps },
  }); }
  return <Modal title={agent ? `Editar ${agent.name}` : "Cadastrar agente"} onClose={onClose}><form className="space-y-5" onSubmit={submit}>
    <Section title="Identidade e inteligência"><div className="grid gap-3 sm:grid-cols-2"><Input name="name" defaultValue={agent?.name ?? ""} placeholder="Nome do chatbot" required /><select name="gender" defaultValue={agent?.gender ?? "MALE"} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="MALE">Masculino</option><option value="FEMALE">Feminino</option></select></div><Textarea className="min-h-28" name="personality" defaultValue={agent?.personality ?? ""} placeholder="Personalidade do chatbot" required /><Textarea className="min-h-28" value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Uma regra por linha" /><Input name="openAiModel" defaultValue={agent?.openAiModel ?? "gpt-4o-mini"} placeholder="Modelo OpenAI" /></Section>
    <Section title="Credenciais Z-API"><div className="grid gap-3 sm:grid-cols-2"><Input name="zapiInstanceId" defaultValue={agent?.zapiInstanceId ?? ""} placeholder="Instance ID" /><Input name="zapiToken" defaultValue={agent?.zapiToken ?? ""} type="password" placeholder={agent?.zapiToken ? "Token configurado" : "Token da instância"} /><Input name="zapiClientToken" defaultValue={agent?.zapiClientToken ?? ""} type="password" placeholder={agent?.zapiClientToken ? "Client Token configurado" : "Client Token da conta Z-API"} /><Input name="zapiWhatsappNumber" defaultValue={agent?.zapiWhatsappNumber ?? ""} placeholder="Número do WhatsApp" /><Input className="sm:col-span-2" name="zapiBaseUrl" defaultValue={agent?.zapiBaseUrl ?? "https://api.z-api.io"} placeholder="URL base Z-API" /></div></Section>
    <Section title="Planos atendidos"><div className="grid gap-2 sm:grid-cols-2">{plans.map((plan) => <label key={plan.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><input name="planIds" value={plan.id} type="checkbox" defaultChecked={agent?.plans.some((item) => item.id === plan.id)} />{plan.name} · {money.format(Number(plan.price))}</label>)}</div></Section>
    <Section title="Comportamento"><div className="grid gap-3 sm:grid-cols-2"><Input name="minTypingSeconds" type="number" min="0" defaultValue={agent?.minTypingSeconds ?? 2} placeholder="Tempo mínimo" /><Input name="maxTypingSeconds" type="number" min="1" defaultValue={agent?.maxTypingSeconds ?? 4} placeholder="Tempo máximo" /></div><div className="grid gap-2 sm:grid-cols-2"><CheckBox name="active" label="Agente ativo" checked={agent?.active ?? true} /><CheckBox name="enableReadReceipt" label="Confirmar leitura" checked={agent?.enableReadReceipt ?? true} /><CheckBox name="enableTyping" label="Simular digitação" checked={agent?.enableTyping ?? true} /><CheckBox name="enableReplyDelay" label="Atraso humanizado" checked={agent?.enableReplyDelay ?? true} /></div></Section>
    <Button className="w-full" disabled={saving}><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar agente"}</Button>
  </form></Modal>;
}

function PlanModal({ plan, saving, onClose, onSave }: { plan: PlanItem | null; saving: boolean; onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  return <Modal title={plan ? "Editar plano" : "Cadastrar plano"} onClose={onClose}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await onSave({ name: f.get("name"), description: f.get("description"), price: Number(f.get("price")), speed: plan?.speed ?? "", active: f.get("active") === "on", order: Number(f.get("order") || 0) }); }}><Input name="name" defaultValue={plan?.name ?? ""} placeholder="Nome do plano" required /><Textarea name="description" defaultValue={plan?.description ?? ""} placeholder="Descrição do plano" /><div className="grid gap-3 sm:grid-cols-2"><Input name="price" defaultValue={plan?.price ?? ""} placeholder="Valor do plano" type="number" min="0" step="0.01" required /><Input name="order" defaultValue={plan?.order ?? 0} placeholder="Ordem" type="number" /></div><CheckBox name="active" label="Plano ativo" checked={plan?.active ?? true} /><Button className="w-full" disabled={saving}><Save className="h-4 w-4" />Salvar plano</Button></form></Modal>;
}

function OpenAiCredentials({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: (data: Record<string, string>) => Promise<void> }) {
  return <Modal title="Credenciais OpenAI" onClose={onClose}><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const key = String(f.get("openAiApiKey") || ""); const payload: Record<string, string> = { openAiModel: String(f.get("openAiModel") || "gpt-4o-mini") }; if (key) payload.openAiApiKey = key; await onSave(payload); }}><div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">A chave é compartilhada por todos os agentes e nunca é exibida nesta tela.</div><Input name="openAiApiKey" type="password" placeholder="Nova chave da OpenAI" /><Input name="openAiModel" defaultValue="gpt-4o-mini" placeholder="Modelo padrão" /><Button className="w-full" disabled={saving}><KeyRound className="h-4 w-4" />Atualizar credenciais</Button></form></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-md border bg-background shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-4"><h2 className="font-semibold">{title}</h2><Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar"><X className="h-5 w-5" /></Button></div><div className="p-5">{children}</div></div></div>; }
function Section({ title, children }: { title: string; children: ReactNode }) { return <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">{title}</legend>{children}</fieldset>; }
function CheckBox({ name, label, checked }: { name: string; label: string; checked: boolean }) { return <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input name={name} type="checkbox" defaultChecked={checked} />{label}</label>; }
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>; }
function Empty({ text }: { text: string }) { return <div className="col-span-full rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">{text}</div>; }
function rulesText(rules?: Record<string, unknown>) {
  const legacyRules: Record<string, string> = {
    neverSayAi: "Nunca informar ao cliente que é uma inteligência artificial.",
    followCommercialFlow: "Seguir sempre o fluxo comercial configurado.",
    validateCepBeforePlans: "Validar o CEP antes de apresentar os planos disponíveis.",
  };

  return Object.entries(rules ?? {})
    .filter(([, value]) => value !== false && value !== null && value !== undefined)
    .map(([key, value]) => legacyRules[key] ?? (typeof value === "string" ? value : String(value)))
    .join("\n");
}
function textRules(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean).reduce<Record<string, string>>((all, item, index) => ({ ...all, [`rule_${index + 1}`]: item }), {}); }
function normalizeSteps(value?: FlowStep[] | string[]): FlowStep[] { if (!Array.isArray(value) || !value.length) return defaultSteps; return value.map((item, index) => typeof item === "string" ? { id: `${item}-${index}`, state: item, title: item.replace(/_/g, " "), message: defaultSteps.find((step) => step.state === item)?.message ?? "Mensagem configurável" } : item); }
