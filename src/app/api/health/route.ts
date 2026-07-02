import { NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;

  return NextResponse.json(
    successResponse("Aplicacao operacional.", {
      database: "connected",
      timestamp: new Date().toISOString(),
    }),
  );
}
