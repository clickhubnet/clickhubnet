"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Clipboard, FileUp, MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { ApiResult } from "@/types/api";

type CepItem = {
  id?: string;
  cep: string;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  available: boolean;
  importedFrom?: string | null;
  importedAt?: string | null;
  source?: string;
} | null;

type CepOverview = {
  total: number;
  available: number;
  unavailable: number;
  recent: NonNullable<CepItem>[];
  cities: Array<{ city: string | null; state: string | null; count: number }>;
};

type CepImportProgress = {
  fileName: string;
  status: "running" | "completed" | "failed";
  processed: number;
  total: number;
  imported: number;
  progress: number;
  message: string;
  error?: string;
};

type BulkCepResult = {
  totalInput: number;
  valid: number;
  duplicates: number;
  invalid: string[];
  found: NonNullable<CepItem>[];
  notFound: string[];
};

export function CepPanel() {
  const overview = useApiResource<CepOverview>("/api/ceps");
  const currentUser = useCurrentUser();
  const isAdmin = currentUser.data?.role === "ADMIN";
  const [result, setResult] = useState<CepItem>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [importJob, setImportJob] = useState<CepImportProgress | null>(null);
  const [bulkCeps, setBulkCeps] = useState("");
  const [bulkResult, setBulkResult] = useState<BulkCepResult | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkCopied, setBulkCopied] = useState(false);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/ceps?cep=${formData.get("cep")}`);
    const data = (await response.json()) as ApiResult<CepItem>;
    if (data.status === "success") {
      setResult(data.data);
      setMessage(
        data.data
          ? data.data.source === "viacep"
            ? "CEP localizado no ViaCEP, mas ainda não está na base Cobertura."
            : "CEP encontrado na base Cobertura."
          : "CEP não encontrado.",
      );
    } else {
      setMessage(data.message);
    }
    setLoading(false);
  }

  async function handleManualCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/ceps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cep: formData.get("cep"),
        street: formData.get("street"),
        neighborhood: formData.get("neighborhood"),
        city: formData.get("city"),
        state: formData.get("state"),
        available: formData.get("available") === "on",
      }),
    });
    const data = (await response.json()) as ApiResult<CepItem>;
    setMessage(data.status === "success" ? "CEP salvo na base Cobertura." : data.message);
    if (data.status === "success") {
      form.reset();
      await overview.refresh();
    }
    setLoading(false);
  }

  async function handleBulkSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBulkLoading(true);
    setBulkCopied(false);
    const response = await fetch(`/api/ceps?ceps=${encodeURIComponent(bulkCeps)}`, { cache: "no-store" });
    const data = (await response.json()) as ApiResult<BulkCepResult>;
    if (data.status === "success") {
      setBulkResult(data.data);
      setMessage(`${data.data.found.length} CEP(s) com cobertura e ${data.data.notFound.length} sem cobertura.`);
    } else {
      setBulkResult(null);
      setMessage(data.message);
    }
    setBulkLoading(false);
  }

  async function copyBulkCoveredCeps() {
    if (!bulkResult?.found.length) return;
    await navigator.clipboard.writeText(bulkResult.found.map((item) => normalizeCep(item.cep)).join("\n"));
    setBulkCopied(true);
    window.setTimeout(() => setBulkCopied(false), 1800);
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileName = String((formData.get("file") as File | null)?.name ?? "arquivo");
    setImportJob({
      fileName,
      status: "running",
      processed: 0,
      total: 0,
      imported: 0,
      progress: 0,
      message: "Importação iniciada em segundo plano. Preparando arquivo...",
    });
    setMessage("Importação iniciada em segundo plano.");

    const response = await fetch("/api/ceps/import", { method: "POST", body: formData });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !response.body || !contentType.includes("application/x-ndjson")) {
      const data = (await response.json()) as ApiResult<unknown>;
      setImportJob((current) => current ? { ...current, status: "failed", message: data.message } : current);
      setMessage(data.message);
      setLoading(false);
      return;
    }

    form.reset();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pendingText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      pendingText += decoder.decode(value, { stream: true });
      const lines = pendingText.split("\n");
      pendingText = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const progress = JSON.parse(line) as CepImportProgress;
        setImportJob(progress);

        if (progress.status === "completed") {
          setMessage(progress.message);
          await overview.refresh();
        }
        if (progress.status === "failed") {
          setMessage(progress.error ?? progress.message);
        }
      }
    }

    setLoading(false);
  }

  return (
    <div className="space-y-4">
      {isAdmin ? <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="CEPs na Cobertura" value={String(overview.data?.total ?? 0)} />
        <Metric label="Com cobertura" value={String(overview.data?.available ?? 0)} />
        <Metric label="Sem cobertura" value={String(overview.data?.unavailable ?? 0)} />
      </div> : null}

      <div className={`grid gap-4 ${isAdmin ? "xl:grid-cols-[1fr_1fr]" : "max-w-2xl"}`}>
        <Card>
          <CardHeader>
            <CardTitle>Consultar Cobertura</CardTitle>
            <CardDescription>Verificação individual na base importada de cobertura</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={handleSearch}>
              <Input name="cep" placeholder="00000-000" required />
              <Button disabled={loading} type="submit" aria-label="Consultar cobertura" title="Consultar cobertura">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
            {message ? <p className="mt-4 text-sm text-muted-foreground">{message}</p> : null}
            {result ? <CepResult result={result} /> : null}
          </CardContent>
        </Card>

        {isAdmin ? <Card>
          <CardHeader>
            <CardTitle>Cadastrar Cobertura</CardTitle>
            <CardDescription>Inclusão ou atualização pontual de CEP</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={handleManualCreate}>
              <Input name="cep" placeholder="CEP" required />
              <Input name="street" placeholder="Logradouro" />
              <div className="grid grid-cols-2 gap-3">
                <Input name="neighborhood" placeholder="Bairro" />
                <Input name="city" placeholder="Cidade" />
              </div>
              <Input name="state" placeholder="UF" maxLength={2} />
              <label className="flex items-center gap-2 text-sm">
                <input className="h-4 w-4" name="available" type="checkbox" defaultChecked />
                <span>Com cobertura ativa</span>
              </label>
              <Button disabled={loading} type="submit">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Salvar CEP
              </Button>
            </form>
          </CardContent>
        </Card> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consultar CEPs em massa</CardTitle>
          <CardDescription>Cole uma lista de CEPs, um por linha, para verificar cobertura em lote.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleBulkSearch}>
            <textarea
              className="min-h-44 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
              value={bulkCeps}
              onChange={(event) => setBulkCeps(event.target.value)}
              placeholder={"Cole os CEPs aqui:\n09340-450\n85859-240\n01001-000"}
              required
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Limite: até 1000 CEPs por consulta.</p>
              <Button disabled={bulkLoading || !bulkCeps.trim()} type="submit">
                <Search className="h-4 w-4" aria-hidden="true" />
                {bulkLoading ? "Consultando..." : "Consultar em massa"}
              </Button>
            </div>
          </form>
          {bulkResult ? (
            <BulkCepResultPanel
              result={bulkResult}
              copied={bulkCopied}
              onCopy={() => void copyBulkCoveredCeps()}
            />
          ) : null}
        </CardContent>
      </Card>

      {isAdmin ? <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Importar Base</CardTitle>
            <CardDescription>Arquivos XLSX ou CSV da base Cobertura</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleImport}>
              <Input accept=".xlsx,.xls,.csv" name="file" required type="file" />
              <Button disabled={loading || importJob?.status === "running"} type="submit">
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Importar Cobertura
              </Button>
            </form>
            {importJob ? <ImportProgress job={importJob} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cidades com Cobertura</CardTitle>
            <CardDescription>Maiores concentrações na base atual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.data?.cities.length ? (
              overview.data.cities.map((city) => (
                <div key={`${city.city}-${city.state}`} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <span>{[city.city, city.state].filter(Boolean).join(" / ")}</span>
                  <strong>{city.count}</strong>
                </div>
              ))
            ) : (
              <EmptyState text="Sem cidades cadastradas" />
            )}
          </CardContent>
        </Card>
      </div> : null}

      {isAdmin ? <Card>
        <CardHeader>
          <CardTitle>Últimos CEPs da Cobertura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {overview.data?.recent.length ? (
              overview.data.recent.map((cep) => <CepResult key={cep.id ?? cep.cep} result={cep} compact />)
            ) : (
              <EmptyState text="Sem importações registradas" />
            )}
          </div>
        </CardContent>
      </Card> : null}
    </div>
  );
}

function ImportProgress({ job }: { job: CepImportProgress }) {
  const progress = Math.max(0, Math.min(100, job.progress));
  const statusLabel = {
    running: "Importando",
    completed: "Concluído",
    failed: "Erro",
  }[job.status];

  return (
    <div className="mt-4 rounded-md border p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{statusLabel}: {job.fileName}</p>
          <p className="text-xs text-muted-foreground">{job.message}</p>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${job.status === "failed" ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {job.total ? `${job.processed.toLocaleString("pt-BR")} / ${job.total.toLocaleString("pt-BR")} linhas` : "Preparando arquivo..."}
        {job.status === "completed" ? ` · ${job.imported.toLocaleString("pt-BR")} importados` : ""}
      </p>
      {job.error ? <p className="mt-2 text-xs text-destructive">{job.error}</p> : null}
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

function CepResult({ result, compact = false }: { result: NonNullable<CepItem>; compact?: boolean }) {
  return (
    <div className="rounded-md border p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        {result.cep}
      </p>
      <p className="mt-2 text-muted-foreground">{result.street || "Sem logradouro"}</p>
      <p className="text-muted-foreground">
        {[result.neighborhood, result.city, result.state].filter(Boolean).join(" - ") || "Sem localização"}
      </p>
      <p className="mt-2 font-medium">{result.available ? "Com cobertura" : "Sem cobertura"}</p>
      {!compact && result.source ? <p className="text-xs text-muted-foreground">Origem: {result.source}</p> : null}
    </div>
  );
}

function BulkCepResultPanel({ result, copied, onCopy }: { result: BulkCepResult; copied: boolean; onCopy: () => void }) {
  const coveredText = result.found.map((item) => normalizeCep(item.cep)).join("\n");

  return (
    <div className="mt-4 space-y-4 rounded-md border p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Consultados" value={String(result.totalInput)} />
        <Metric label="Válidos únicos" value={String(result.valid)} />
        <Metric label="Com cobertura" value={String(result.found.length)} />
        <Metric label="Sem cobertura" value={String(result.notFound.length)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          CEPs com cobertura
        </p>
        <Button size="sm" variant="outline" type="button" onClick={onCopy} disabled={!result.found.length}>
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copiado" : "Copiar CEPs com cobertura"}
        </Button>
      </div>
      <textarea
        className="min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none"
        value={coveredText}
        readOnly
        placeholder="Os CEPs com cobertura aparecerão aqui."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Detalhes encontrados</p>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {result.found.length ? (
              result.found.map((item) => <CepResult key={`${item.id ?? item.cep}-${item.street ?? ""}`} result={item} compact />)
            ) : (
              <EmptyState text="Nenhum CEP com cobertura encontrado." />
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Sem cobertura / inválidos</p>
          <div className="max-h-80 space-y-2 overflow-auto pr-1">
            {result.notFound.length ? (
              <div className="rounded-md border p-3 font-mono text-sm text-muted-foreground">
                {result.notFound.map((cep) => normalizeCep(cep)).join("\n")}
              </div>
            ) : null}
            {result.invalid.length ? (
              <div className="rounded-md border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                <p className="font-medium">Inválidos ignorados:</p>
                <p className="mt-1 font-mono">{result.invalid.join(", ")}</p>
              </div>
            ) : null}
            {!result.notFound.length && !result.invalid.length ? <EmptyState text="Nenhum CEP sem cobertura." /> : null}
            {result.duplicates ? (
              <p className="text-xs text-muted-foreground">{result.duplicates} CEP(s) duplicado(s) removido(s) da consulta.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{text}</p>;
}

function normalizeCep(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return String(value ?? "").trim();
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
