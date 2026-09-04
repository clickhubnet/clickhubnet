import { NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { processDueBroadcasts } from "@/services/whatsapp-broadcast";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const authHeader = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const querySecret = new URL(request.url).searchParams.get("secret")?.trim();
    if (authHeader !== secret && querySecret !== secret) {
      return NextResponse.json(errorResponse("Cron nao autorizado.", "UNAUTHORIZED"), { status: 401 });
    }
  }

  const result = await processDueBroadcasts();
  return NextResponse.json(successResponse("Disparos processados.", result));
}
