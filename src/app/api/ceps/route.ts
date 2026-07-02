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
