import { NextResponse } from "next/server";
import { permissions } from "@/constants/permissions";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { checkEvolutionWhatsAppNumber } from "@/services/evolution";
import { parsePhoneList } from "@/services/validators";

type VerifyWhatsAppBody = {
  phones?: string;
};

const MAX_VERIFY_NUMBERS = 500;
const VERIFY_CONCURRENCY = 5;

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.conversationsView);
    const body = await request.json().catch(() => null) as VerifyWhatsAppBody | null;
    const parsed = parsePhoneList(String(body?.phones ?? ""));
    const invalid = parsed.filter((item) => !item.valid).map((item) => item.raw);
    const valid = parsed.filter((item) => item.valid);
    const uniquePhones = Array.from(new Set(valid.map((item) => item.phone)));
    const duplicates = Math.max(0, valid.length - uniquePhones.length);

    if (!uniquePhones.length) {
      return NextResponse.json(errorResponse("Informe ao menos um numero valido para verificar.", "VALIDATION_ERROR"), { status: 422 });
    }

    if (uniquePhones.length > MAX_VERIFY_NUMBERS) {
      return NextResponse.json(errorResponse(`Verifique no maximo ${MAX_VERIFY_NUMBERS} numeros por vez.`, "BATCH_LIMIT"), { status: 422 });
    }

    const checked = await runWithConcurrency(uniquePhones, VERIFY_CONCURRENCY, async (phone) => {
      try {
        const result = await checkEvolutionWhatsAppNumber(phone);
        return {
          phone,
          resolvedPhone: result.phone,
          hasWhatsApp: result.exists,
          error: null as string | null,
        };
      } catch (error) {
        return {
          phone,
          resolvedPhone: phone,
          hasWhatsApp: false,
          error: error instanceof Error ? error.message : "Falha ao verificar numero.",
        };
      }
    });

    const withWhatsApp = checked
      .filter((item) => item.hasWhatsApp)
      .map((item) => item.resolvedPhone || item.phone);
    const withoutWhatsApp = checked.filter((item) => !item.hasWhatsApp && !item.error).map((item) => item.phone);
    const errors = checked.filter((item) => item.error).map((item) => ({ phone: item.phone, error: item.error }));

    return NextResponse.json(successResponse("Numeros verificados.", {
      withWhatsApp,
      formatted: withWhatsApp.join("\n"),
      summary: {
        totalInput: parsed.length,
        valid: uniquePhones.length,
        withWhatsApp: withWhatsApp.length,
        withoutWhatsApp: withoutWhatsApp.length,
        invalid: invalid.length,
        duplicates,
        errors: errors.length,
      },
      ignored: {
        withoutWhatsApp,
        invalid,
        errors,
      },
    }));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse(error instanceof Error ? error.message : "Nao foi possivel verificar os numeros."), { status: 500 });
  }
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}
