import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/api-errors";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth-context";
import { assertPermission } from "@/lib/permissions";
import { permissions } from "@/constants/permissions";
import { DashboardService } from "@/modules/dashboard/services/dashboard.service";

const dashboardService = new DashboardService();

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertPermission(user, permissions.dashboardView);
    const { searchParams } = new URL(request.url);
    const overview = await dashboardService.getOverview(parseDashboardFilters(searchParams), user);
    return NextResponse.json(successResponse("Dashboard consultada.", overview));
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) return authError;
    return NextResponse.json(errorResponse("Nao foi possivel consultar a dashboard."), {
      status: 500,
    });
  }
}

function parseDashboardFilters(searchParams: URLSearchParams) {
  const period = searchParams.get("period");
  if (period && period !== "custom") {
    const days = Number(period);
    if (Number.isFinite(days) && days > 0) {
      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
  }

  return {
    from: parseDateParam(searchParams.get("from"), "start"),
    to: parseDateParam(searchParams.get("to"), "end"),
  };
}

function parseDateParam(value: string | null, boundary: "start" | "end") {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T${boundary === "start" ? "00:00:00" : "23:59:59"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
