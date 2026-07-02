import { prisma } from "@/lib/prisma";

const settingKeys = [
  "openAiApiKey",
  "openAiModel",
  "zapiBaseUrl",
  "zapiInstanceId",
  "zapiToken",
  "zapiClientToken",
  "zapiWhatsappNumber",
] as const;

type SettingKey = (typeof settingKeys)[number];

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function getSettingsMap() {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [...settingKeys] } },
  });

  return new Map(settings.map((setting) => [setting.key as SettingKey, stringValue(setting.value)]));
}

export async function getOpenAiRuntimeConfig() {
  const settings = await getSettingsMap();
  return {
    apiKey: settings.get("openAiApiKey") || process.env.OPENAI_API_KEY || "",
    model: settings.get("openAiModel") || process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

export async function getZapiRuntimeConfig() {
  const settings = await getSettingsMap();
  return {
    baseUrl: settings.get("zapiBaseUrl") || process.env.ZAPI_BASE_URL || "https://api.z-api.io",
    instanceId: settings.get("zapiInstanceId") || process.env.ZAPI_INSTANCE_ID || "",
    token: settings.get("zapiToken") || process.env.ZAPI_TOKEN || "",
    clientToken: settings.get("zapiClientToken") || process.env.ZAPI_CLIENT_TOKEN || "",
    whatsappNumber: settings.get("zapiWhatsappNumber") || process.env.ZAPI_WHATSAPP_NUMBER || "",
  };
}
