import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";

export function authErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json(errorResponse("Sessao expirada ou invalida.", "UNAUTHORIZED"), {
      status: 401,
    });
  }

  if (error instanceof Error && error.message === "FORBIDDEN") {
    return NextResponse.json(errorResponse("Permissao insuficiente.", "FORBIDDEN"), {
      status: 403,
    });
  }

  return null;
}
