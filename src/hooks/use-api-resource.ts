"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResult } from "@/types/api";

const inFlightRequests = new Map<string, Promise<{ response: Response; body: string }>>();

function requestOnce(url: string) {
  const existing = inFlightRequests.get(url);
  if (existing) return existing;
  const request = fetch(url, { cache: "no-store" })
    .then(async (response) => ({ response, body: await response.text() }))
    .finally(() => window.setTimeout(() => inFlightRequests.delete(url), 250));
  inFlightRequests.set(url, request);
  return request;
}

export function useApiResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { response, body } = await requestOnce(url);

      if (!body.trim()) {
        setError(response.ok ? "O servidor retornou uma resposta vazia." : `Falha na consulta (${response.status}).`);
        return;
      }

      let result: ApiResult<T>;
      try {
        result = JSON.parse(body) as ApiResult<T>;
      } catch {
        setError(`O servidor retornou uma resposta inválida (${response.status}).`);
        return;
      }

      if (response.ok && result.status === "success") {
        setData(result.data);
      } else {
        setError(result.message || `Falha na consulta (${response.status}).`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível consultar o servidor.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
