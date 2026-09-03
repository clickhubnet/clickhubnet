import { handleEvolutionWebhook, handleEvolutionWebhookHealth } from "@/app/api/whatsapp/webhook/handler";

export async function POST(request: Request) {
  return handleEvolutionWebhook(request);
}

export async function GET() {
  return handleEvolutionWebhookHealth();
}
