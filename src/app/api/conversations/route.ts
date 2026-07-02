import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { ConversationService } from "@/modules/chatbot/services/conversation.service";

const conversationService = new ConversationService();

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.agentsEdit);
    const conversations = await conversationService.list();
    return NextResponse.json(successResponse("Conversas consultadas.", conversations));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar as conversas."), {
      status: 500,
    });
  }
}
