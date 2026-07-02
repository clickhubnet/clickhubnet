export const zapiConfig = {
  baseUrl: process.env.ZAPI_BASE_URL ?? "https://api.z-api.io",
  instanceId: process.env.ZAPI_INSTANCE_ID ?? "",
  token: process.env.ZAPI_TOKEN ?? "",
  clientToken: process.env.ZAPI_CLIENT_TOKEN ?? "",
  whatsappNumber: process.env.ZAPI_WHATSAPP_NUMBER ?? "",
};
