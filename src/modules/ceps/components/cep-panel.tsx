"use client";

import { FormEvent, useState } from "react";
import { FileUp, MapPin, Plus, Search } from "lucide-react";
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

export function CepPanel() {
  const overview = useApiResource<CepOverview>("/api/ceps");
  const currentUser = useCurrentUser();
  const isAdmin = currentUser.data?.role === "ADMIN";
  const [result, setResult] = useState<CepItem>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [importJob, setImportJob] = useState<CepImportProgress | null>(null);

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
            ? "CEP localizado no ViaCEP, mas ainda não está na base Cobertura Claro."
            : "CEP encontrado na base Cobertura Claro."
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
    setMessage(data.status === "success" ? "CEP salvo na base Cobertura Claro." : data.message);
    if (data.status === "success") {
      form.reset();
      await overview.refresh();
    }
    setLoading(false);
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
        <Metric label="CEPs na Cobertura Claro" value={String(overview.data?.total ?? 0)} />
        <Metric label="Com cobertura" value={String(overview.data?.available ?? 0)} />
        <Metric label="Sem cobertura" value={String(overview.data?.unavailable ?? 0)} />
      </div> : null}

      <div className={`grid gap-4 ${isAdmin ? "xl:grid-cols-[1fr_1fr]" : "max-w-2xl"}`}>
        <Card>
          <CardHeader>
            <CardTitle>Consultar Cobertura Claro</CardTitle>
            <CardDescription>Verificação na base importada de cobertura Claro</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex gap-2" onSubmit={handleSearch}>
              <Input name="cep" placeholder="00000-000" required />
              <Button disabled={loading} type="submit" aria-label="Consultar cobertura Claro" title="Consultar cobertura Claro">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
            {message ? <p className="mt-4 text-sm text-muted-foreground">{message}</p> : null}
            {result ? <CepResult result={result} /> : null}
          </CardContent>
        </Card>

        {isAdmin ? <Card>
          <CardHeader>
            <CardTitle>Cadastrar Cobertura Claro</CardTitle>
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

      {isAdmin ? <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Importar Base</CardTitle>
            <CardDescription>Arquivos XLSX ou CSV da base Cobertura Claro</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleImport}>
              <Input accept=".xlsx,.xls,.csv" name="file" required type="file" />
              <Button disabled={loading || importJob?.status === "running"} type="submit">
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Importar Cobertura Claro
              </Button>
            </form>
            {importJob ? <ImportProgress job={importJob} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cidades com Cobertura Claro</CardTitle>
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
          <CardTitle>Últimos CEPs da Cobertura Claro</CardTitle>
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

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">{text}</p>;
}
