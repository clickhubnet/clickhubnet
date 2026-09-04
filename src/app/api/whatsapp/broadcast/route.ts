import { NextResponse } from "next/server";
import { WHATSAPP_BROADCAST_MAX_BATCH_SIZE } from "@/config/whatsapp-broadcast";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { createBroadcastDispatch, listBroadcastDispatches, saveBroadcastDispatch, type BroadcastScheduleBlock } from "@/services/whatsapp-broadcast";
import { parsePhoneList } from "@/services/validators";

type BroadcastBody = {
  phones?: string;
  message?: string;
  scheduleBlocks?: BroadcastScheduleBlock[];
};

export async function GET() {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
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
    const scheduleBlocks = Array.isArray(body?.scheduleBlocks) ? body.scheduleBlocks : [];
    const parsedPhones = parsePhoneList(String(body?.phones ?? ""));
    const validPhones = parsedPhones.filter((item) => item.valid);
    const invalidPhones = parsedPhones.filter((item) => !item.valid).map((item) => item.raw);

    if (!message) {
      return NextResponse.json(errorResponse("Mensagem obrigatoria.", "VALIDATION_ERROR"), { status: 422 });
    }

    if (!validPhones.length) {
      return NextResponse.json(errorResponse("Informe ao menos um numero valido.", "VALIDATION_ERROR"), { status: 422 });
    }

    if (!scheduleBlocks.length || scheduleBlocks.every((block) => !block.time || !Number(block.quantity))) {
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
      phones,
      invalidPhones,
      duplicatePhones,
      scheduleBlocks,
      ownerUserId: user.id,
    });
    await saveBroadcastDispatch(dispatch);

    return NextResponse.json(successResponse("Disparo em lote agendado.", {
      id: dispatch.id,
      batchId,
      totalValidPhones: phones.length,
      totalInvalidPhones: invalidPhones.length,
      totalDuplicatePhones: duplicatePhones.length,
      scheduled: true,
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
