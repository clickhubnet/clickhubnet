import OpenAI from "openai";
import { getOpenAiRuntimeConfig } from "@/lib/integration-config";

export class OpenAiService {
  async answerCommercialQuestion(prompt: string) {
    const config = await getOpenAiRuntimeConfig();
    if (!config.apiKey) {
      return "";
    }

    const client = new OpenAI({ apiKey: config.apiKey });
    const response = await client.responses.create({
      model: config.model,
      input: prompt,
    });

    return response.output_text;
  }

  async extractCustomerData(input: { url: string; mimeType: string }) {
    const config = await getOpenAiRuntimeConfig();
    if (!config.apiKey) return {};

    const client = new OpenAI({ apiKey: config.apiKey, timeout: 30_000 });
    const media = input.mimeType === "application/pdf"
      ? { type: "input_file" as const, file_url: input.url }
      : { type: "input_image" as const, image_url: input.url, detail: "high" as const };
    const response = await client.responses.create({
      model: config.model,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Leia este documento brasileiro e extraia somente dados explicitamente visiveis.",
              "Pode ser conta de consumo, comprovante de residencia, RG, CNH ou outro documento.",
              "Nunca deduza nem complete dados ilegíveis. Use null quando não houver certeza.",
              "Responda apenas JSON válido, sem markdown, neste formato:",
              '{"cep":null,"fullName":null,"cpf":null,"birthDate":null,"streetNumber":null,"address":null,"neighborhood":null,"city":null,"state":null,"email":null}',
              "Se for comprovante de residencia, priorize extrair CEP, logradouro, numero, bairro, cidade, estado, nome e CPF quando estiverem legiveis.",
              "Em address, retorne somente o logradouro sem numero, bairro, cidade ou estado.",
              "Normalize CEP como 8 dígitos, CPF como 11 dígitos e nascimento como DD/MM/AAAA.",
            ].join("\n"),
          },
          media,
        ],
      }],
    });

    return parseExtractedCustomerData(response.output_text);
  }

  async transcribeAudio(input: { url: string; mimeType: string }) {
    const config = await getOpenAiRuntimeConfig();
    if (!config.apiKey) return "";

    const mediaResponse = await fetch(input.url, { signal: AbortSignal.timeout(12_000) });
    if (!mediaResponse.ok) throw new Error("Não foi possível baixar o áudio recebido.");
    const declaredSize = Number(mediaResponse.headers.get("content-length") ?? 0);
    if (declaredSize > 20 * 1024 * 1024) throw new Error("Áudio excede o limite de 20 MB.");

    const bytes = await mediaResponse.arrayBuffer();
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Áudio excede o limite de 20 MB.");
    const mimeType = input.mimeType.split(";")[0] || "audio/ogg";
    const extension = audioExtension(mimeType);
    const file = new File([bytes], `audio.${extension}`, { type: mimeType });
    const client = new OpenAI({ apiKey: config.apiKey, timeout: 25_000, maxRetries: 0 });
    const transcription = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
      language: "pt",
      prompt: "Atendimento comercial brasileiro de internet Claro. Preserve nomes, números, CEP, CPF, e-mail e datas falados.",
    });

    return transcription.text.trim();
  }
}

export type ExtractedCustomerData = {
  cep?: string;
  fullName?: string;
  cpf?: string;
  birthDate?: string;
  streetNumber?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  email?: string;
};

function parseExtractedCustomerData(value: string): ExtractedCustomerData {
  try {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start < 0 || end <= start) return {};
    const parsed = JSON.parse(value.slice(start, end + 1)) as Record<string, unknown>;
    const text = (key: string) => typeof parsed[key] === "string" && parsed[key] ? String(parsed[key]).trim() : undefined;
    return {
      cep: digitsWithLength(text("cep"), 8),
      fullName: text("fullName"),
      cpf: digitsWithLength(text("cpf"), 11),
      birthDate: text("birthDate"),
      streetNumber: text("streetNumber"),
      address: text("address"),
      neighborhood: text("neighborhood"),
      city: text("city"),
      state: text("state"),
      email: text("email"),
    };
  } catch {
    return {};
  }
}

function digitsWithLength(value: string | undefined, length: number) {
  const digits = value?.replace(/\D/g, "");
  return digits?.length === length ? digits : undefined;
}

function audioExtension(mimeType: string) {
  const extensions: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "audio/webm": "webm",
  };
  return extensions[mimeType] ?? "ogg";
}
