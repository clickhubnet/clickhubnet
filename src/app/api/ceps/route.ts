import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { CepRepository } from "@/repositories/cep.repository";
import { ViaCepService } from "@/services/viacep/viacep.service";
import { onlyDigits } from "@/utils/mask";

const cepRepository = new CepRepository();
const viaCepService = new ViaCepService();

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.cepsView);

    const url = new URL(request.url);
    const cep = onlyDigits(url.searchParams.get("cep") ?? "");
    const cepsRaw = url.searchParams.get("ceps") ?? "";
    const ceps = cepsRaw
      .split(/[\n,;|\s]+/)
      .map((value) => onlyDigits(value).slice(0, 8))
      .filter((value) => value.length > 0);

    if (cepsRaw.trim()) {
      const validCeps = Array.from(new Set(ceps.filter((value) => value.length === 8)));
      const invalidCeps = ceps.filter((value) => value.length !== 8);
      if (!validCeps.length) {
        return NextResponse.json(errorResponse("Informe ao menos um CEP valido.", "INVALID_CEP"), { status: 400 });
      }
      if (validCeps.length > 1000) {
        return NextResponse.json(errorResponse("Consulte no maximo 1000 CEPs por vez.", "BATCH_LIMIT"), { status: 422 });
      }

      const foundRows = await cepRepository.findManyByCeps(validCeps);
      const foundByCep = new Map<string, typeof foundRows[number]>();
      for (const item of foundRows) {
        if (!foundByCep.has(item.cep)) foundByCep.set(item.cep, item);
      }
      const found = validCeps.flatMap((value) => {
        const item = foundByCep.get(value);
        return item ? [{ ...item, source: "base" }] : [];
      });
      const notFound = validCeps.filter((value) => !foundByCep.has(value));

      return NextResponse.json(successResponse("CEPs consultados.", {
        totalInput: ceps.length,
        valid: validCeps.length,
        duplicates: Math.max(0, ceps.filter((value) => value.length === 8).length - validCeps.length),
        invalid: invalidCeps,
        found,
        notFound,
      }));
    }

    if (!cep) {
      const overview = await cepRepository.overview();
      return NextResponse.json(successResponse("Resumo de CEPs consultado.", overview));
    }

    if (cep.length !== 8) {
      return NextResponse.json(errorResponse("Informe um CEP valido.", "INVALID_CEP"), {
        status: 400,
      });
    }

    const coverage = await cepRepository.findByCep(cep);
    if (coverage) {
      return NextResponse.json(successResponse("CEP consultado.", { ...coverage, source: "base" }));
    }

    const viaCep = await viaCepService.findAddress(cep);
    return NextResponse.json(
      successResponse("CEP consultado.", viaCep ? { ...viaCep, available: false, source: "viacep" } : null),
    );
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar o CEP."), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    assertPermission(user, permissions.cepsImport);

    const body = (await request.json()) as {
      cep?: string;
      street?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      available?: boolean;
    };
    const cep = onlyDigits(body.cep ?? "").slice(0, 8);

    if (cep.length !== 8) {
      return NextResponse.json(errorResponse("Informe um CEP valido.", "INVALID_CEP"), {
        status: 400,
      });
    }

    const coverage = await cepRepository.upsertOne({
      cep,
      street: body.street,
      neighborhood: body.neighborhood,
      city: body.city,
      state: body.state?.toUpperCase(),
      available: body.available ?? true,
      importedFrom: "cadastro-manual",
    });
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "ceps",
      description: `CEP salvo: ${coverage.cep}`,
      metadata: { cep: coverage.cep },
    });

    return NextResponse.json(successResponse("CEP salvo.", coverage), { status: 201 });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel salvar o CEP."), { status: 500 });
  }
}
