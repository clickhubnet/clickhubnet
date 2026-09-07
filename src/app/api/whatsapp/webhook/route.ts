import { handleEvolutionWebhook, handleWhatsAppWebhookHealth } from "@/app/api/whatsapp/webhook/handler";

export async function POST(request: Request) {
  return handleEvolutionWebhook(request);
}

export async function GET(request: Request) {
  return handleWhatsAppWebhookHealth(request);
}
