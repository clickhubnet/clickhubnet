import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { ConversationService } from "@/modules/chatbot/services/conversation.service";
import { normalizePhone } from "@/services/validators";

const conversationService = new ConversationService();

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    const conversations = id ? await conversationService.get(id) : await conversationService.list();
    if (!conversations) {
      return NextResponse.json(errorResponse("Conversa nao encontrada.", "NOT_FOUND"), { status: 404 });
    }
    return NextResponse.json(successResponse("Conversas consultadas.", conversations));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar as conversas."), {
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => ({})) as { phone?: string; name?: string; assignedTo?: string };
    const phone = normalizePhone(body.phone ?? "");
    if (!phone) {
      return NextResponse.json(errorResponse("Telefone obrigatorio.", "VALIDATION_ERROR"), { status: 422 });
    }

    const conversation = await conversationService.create({
      phone,
      name: body.name,
      assignedTo: body.assignedTo,
      ownerUserId: user.id,
    });
    return NextResponse.json(successResponse("Conversa criada.", conversation), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel criar a conversa."), { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => ({})) as {
      id?: string;
      name?: string;
      assignedTo?: string;
      tags?: unknown;
      state?: string;
      blocked?: boolean;
    };
    if (!body.id) {
      return NextResponse.json(errorResponse("ID obrigatorio.", "VALIDATION_ERROR"), { status: 422 });
    }

    const conversation = await conversationService.update(body as { id: string; name?: string; assignedTo?: string; tags?: unknown; state?: string; blocked?: boolean });
    return NextResponse.json(successResponse("Conversa atualizada.", conversation));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel atualizar a conversa."), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => ({})) as { id?: string };
    if (!body.id) {
      return NextResponse.json(errorResponse("ID obrigatorio.", "VALIDATION_ERROR"), { status: 422 });
    }

    await conversationService.delete(body.id);
    return NextResponse.json(successResponse("Conversa excluida.", { id: body.id }));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir a conversa."), { status: 500 });
  }
}
