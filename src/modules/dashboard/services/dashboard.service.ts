import { DashboardRepository } from "@/repositories/dashboard.repository";
import type { DashboardFilters } from "@/repositories/dashboard.repository";
import type { User } from "@prisma/client";

export class DashboardService {
  constructor(private readonly dashboardRepository = new DashboardRepository()) {}

  async getOverview(filters?: DashboardFilters, user?: Pick<User, "id" | "role">) {
    return this.dashboardRepository.getMetrics(filters, user);
  }
}
