"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Download, Loader2, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResult } from "@/types/api";

type VerifyResult = {
  withWhatsApp: string[];
  formatted: string;
  summary: {
    totalInput: number;
    valid: number;
    withWhatsApp: number;
    withoutWhatsApp: number;
    invalid: number;
    duplicates: number;
    errors: number;
  };
  ignored: {
    withoutWhatsApp: string[];
    invalid: string[];
    errors: Array<{ phone: string; error: string | null }>;
  };
};

export function WhatsAppVerifierPanel() {
  const [phones, setPhones] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const estimatedCount = useMemo(() => phones.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).length, [phones]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setCopied(false);
    setLoading(true);
    const response = await fetch("/api/whatsapp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phones }),
    });
    const payload = await response.json() as ApiResult<VerifyResult>;
    setLoading(false);
    if (payload.status !== "success") {
      setError(payload.message);
      return;
    }
    setResult(payload.data);
  }

  async function copyResult() {
    if (!result?.formatted) return;
    await navigator.clipboard.writeText(result.formatted);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function handleFileChange(file?: File | null) {
    if (!file) return;
    setError("");
    setResult(null);
    setFileName(file.name);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "csv" || file.type.includes("csv")) {
        const text = await file.text();
        setPhones((current) => mergePhoneText(current, text));
        return;
      }

      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const values: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
        values.push(...rows.flatMap((row) => row.map((cell) => String(cell ?? ""))));
      }
      setPhones((current) => mergePhoneText(current, values.join("\n")));
    } catch {
      setFileName("");
      setError("Nao foi possivel ler a planilha. Use .xlsx, .xls ou .csv.");
    }
  }

  async function downloadFilteredSpreadsheet() {
    if (!result?.withWhatsApp.length) return;
    const XLSX = await import("xlsx");
    const rows = result.withWhatsApp.map((phone) => ({ WHATSAPP: phone }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Com WhatsApp");
    XLSX.writeFile(workbook, `whatsapp-verificados-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
      <Card className="glass-panel neon-ring">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-blue-300" />
            Verificar WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-400/30 bg-blue-500/5 p-4 text-sm font-medium text-blue-100 transition hover:bg-blue-500/10">
              <Upload className="h-4 w-4" />
              {fileName ? `Planilha carregada: ${fileName}` : "Importar planilha .xlsx, .xls ou .csv"}
              <input
                className="hidden"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => void handleFileChange(event.target.files?.[0])}
              />
            </label>
            <Textarea
              className="min-h-[24rem]"
              value={phones}
              onChange={(event) => setPhones(event.target.value)}
              placeholder={"Cole os números aqui, um por linha:\n5511978140022\n11999999999\n(11) 99999-9999"}
              required
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {estimatedCount} número(s) na lista. Máximo recomendado: 500 por verificação.
              </p>
              <Button type="submit" disabled={loading || !phones.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {loading ? "Verificando..." : "Verificar números"}
              </Button>
            </div>
          </form>
          {error ? (
            <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="glass-panel neon-ring">
        <CardHeader>
          <CardTitle>Números com WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <Metric label="Entrada" value={result.summary.totalInput} />
                <Metric label="Com WhatsApp" value={result.summary.withWhatsApp} positive />
                <Metric label="Sem WhatsApp" value={result.summary.withoutWhatsApp} />
                <Metric label="Duplicados removidos" value={result.summary.duplicates} />
              </div>
              <Textarea
                className="min-h-[18rem] font-mono text-sm"
                value={result.formatted}
                readOnly
                placeholder="Os números com WhatsApp aparecerão aqui."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" type="button" onClick={() => void copyResult()} disabled={!result.formatted}>
                  <Clipboard className="h-4 w-4" />
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <Button className="w-full" type="button" variant="outline" onClick={() => void downloadFilteredSpreadsheet()} disabled={!result.withWhatsApp.length}>
                  <Download className="h-4 w-4" />
                  Baixar planilha limpa
                </Button>
              </div>
              <p className="rounded-xl border border-blue-400/15 bg-blue-500/5 p-3 text-xs text-muted-foreground">
                A planilha baixada remove duplicados, inválidos e números sem WhatsApp. Ela sai com uma coluna chamada WHATSAPP.
              </p>
              {result.summary.errors ? (
                <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
                  {result.summary.errors} número(s) não puderam ser verificados por erro da Evolution e foram ignorados.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[24rem] items-center justify-center rounded-xl border border-dashed border-blue-400/20 bg-blue-500/5 p-6 text-center text-sm text-muted-foreground">
              Verifique uma lista para gerar a saída já formatada, um número por linha.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function mergePhoneText(current: string, next: string) {
  const currentLines = current.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const nextLines = extractPhoneCandidates(next);
  return [...currentLines, ...nextLines].join("\n");
}

function extractPhoneCandidates(value: string) {
  return value
    .split(/[\n,;|\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\D/g, ""))
    .map((digits) => {
      if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
      const withoutZeros = digits.replace(/^0+/, "");
      if (withoutZeros.length === 10 || withoutZeros.length === 11) return `55${withoutZeros}`;
      return withoutZeros;
    })
    .filter((digits) => /^55\d{10,11}$/.test(digits));
}

function Metric({ label, value, positive = false }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${positive ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border-blue-400/15 bg-blue-500/5"}`}>
      <p>{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
