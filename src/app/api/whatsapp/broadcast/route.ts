import { NextResponse } from "next/server";
import { WHATSAPP_BROADCAST_MAX_BATCH_SIZE } from "@/config/whatsapp-broadcast";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { cancelBroadcastDispatches, createBroadcastDispatch, deleteBroadcastDispatches, listBroadcastDispatches, processDueBroadcasts, saveBroadcastDispatch, type BroadcastScheduleBlock } from "@/services/whatsapp-broadcast";
import { parsePhoneList } from "@/services/validators";

type BroadcastBody = {
  phones?: string;
  message?: string;
  media?: string;
  mimeType?: string;
  fileName?: string;
  scheduleBlocks?: BroadcastScheduleBlock[];
  sendNow?: boolean;
};

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    await processDueBroadcasts(3);
    const records = await listBroadcastDispatches();
    return NextResponse.json(successResponse("Historico de disparos consultado.", records));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar os disparos."), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => null) as BroadcastBody | null;
    const message = String(body?.message ?? "").trim();
    const media = String(body?.media ?? "").trim();
    const scheduleBlocks = Array.isArray(body?.scheduleBlocks) ? body.scheduleBlocks : [];
    const sendNow = body?.sendNow === true;
    const parsedPhones = parsePhoneList(String(body?.phones ?? ""));
    const validPhones = parsedPhones.filter((item) => item.valid);
    const invalidPhones = parsedPhones.filter((item) => !item.valid).map((item) => item.raw);

    if (!message && !media) {
      return NextResponse.json(errorResponse("Mensagem ou imagem obrigatoria.", "VALIDATION_ERROR"), { status: 422 });
    }

    if (!validPhones.length) {
      return NextResponse.json(errorResponse("Informe ao menos um numero valido.", "VALIDATION_ERROR"), { status: 422 });
    }

    if (!sendNow && (!scheduleBlocks.length || scheduleBlocks.every((block) => !block.time || !Number(block.quantity)))) {
      return NextResponse.json(errorResponse("Informe ao menos um horario e quantidade para o disparo.", "VALIDATION_ERROR"), { status: 422 });
    }

    const seenPhones = new Set<string>();
    const uniqueValidPhones = validPhones.filter((item) => {
      if (seenPhones.has(item.phone)) return false;
      seenPhones.add(item.phone);
      return true;
    });
    const duplicatePhones = validPhones
      .filter((item, index) => validPhones.findIndex((entry) => entry.phone === item.phone) !== index)
      .map((item) => item.phone);

    if (uniqueValidPhones.length > WHATSAPP_BROADCAST_MAX_BATCH_SIZE) {
      return NextResponse.json(
        errorResponse(`O lote ultrapassa o limite seguro de ${WHATSAPP_BROADCAST_MAX_BATCH_SIZE} numeros por envio.`, "BATCH_LIMIT"),
        { status: 422 },
      );
    }

    const batchId = `broadcast-${Date.now()}`;
    const phones = uniqueValidPhones.map((item) => item.phone);
    const dispatch = createBroadcastDispatch({
      batchId,
      message,
      media: media || undefined,
      mediaKind: media ? "imagem" : undefined,
      mimeType: body?.mimeType,
      fileName: body?.fileName,
      phones,
      invalidPhones,
      duplicatePhones,
      scheduleBlocks,
      sendNow,
      ownerUserId: user.id,
    });
    await saveBroadcastDispatch(dispatch);
    const processed = await processDueBroadcasts(sendNow ? 1 : 3);

    return NextResponse.json(successResponse("Disparo em lote agendado.", {
      id: dispatch.id,
      batchId,
      totalValidPhones: phones.length,
      totalInvalidPhones: invalidPhones.length,
      totalDuplicatePhones: duplicatePhones.length,
      scheduled: !sendNow,
      sendNow,
      processed,
    }), { status: 202 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(
      errorResponse(error instanceof Error ? error.message : "Nao foi possivel iniciar o disparo.", "BROADCAST_ERROR"),
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => ({})) as { ids?: string[]; action?: string };
    const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.trim()) : [];
    if (body.action !== "cancel" || !ids.length) {
      return NextResponse.json(errorResponse("Informe os agendamentos para cancelar.", "VALIDATION_ERROR"), { status: 422 });
    }
    const result = await cancelBroadcastDispatches(ids);
    return NextResponse.json(successResponse("Agendamento cancelado.", result));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel cancelar o agendamento."), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({})) as { ids?: string[]; all?: boolean };
    const deleteAll = body.all === true || url.searchParams.get("all") === "1" || url.searchParams.get("all") === "true";
    const ids = Array.isArray(body.ids) ? body.ids : url.searchParams.getAll("id");
    const result = await deleteBroadcastDispatches(deleteAll ? undefined : ids);
    return NextResponse.json(successResponse("Historico de disparos excluido.", result));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel excluir o historico."), { status: 500 });
  }
}
