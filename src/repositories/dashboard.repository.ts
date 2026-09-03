import { LeadStatus, Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type DashboardFilters = {
  from?: Date;
  to?: Date;
};

const dashboardKanbanStatusOrder = [
  LeadStatus.NEW,
  LeadStatus.QUALIFIED,
  LeadStatus.CONTACTED,
  LeadStatus.PROPOSAL,
  LeadStatus.WON,
  LeadStatus.LOST,
];

export class DashboardRepository {
  async getMetrics(filters: DashboardFilters = {}, user?: Pick<User, "id" | "role">) {
    const chartDateFilter = buildDateFilter(filters);
    const accessWhere = buildDashboardAccessWhere(user);
    const chartLeadWhere: Prisma.LeadWhereInput = { deletedAt: null, ...accessWhere, ...chartDateFilter };
    const chartConversationWhere: Prisma.ChatConversationWhereInput = { deletedAt: null, ...chartDateFilter };
    const todayFilter = buildTodayFilter();
    const wonWhere: Prisma.LeadWhereInput = { deletedAt: null, status: LeadStatus.WON, ...buildWonAccessWhere(user) };
    const visibleLeadWhere: Prisma.LeadWhereInput = { deletedAt: null, ...accessWhere };

    const [newLeads, totalLeads, conversations, appointments, expenses, leadStatuses, wonLeadRows, chartLeads, chartConversations, recentLeads, kanbanPreview] =
      await Promise.all([
      prisma.lead.count({ where: { deletedAt: null, createdAt: todayFilter, ...accessWhere } }),
      prisma.lead.count({ where: visibleLeadWhere }),
      prisma.chatConversation.count({ where: { deletedAt: null } }),
      prisma.appointment.count({ where: user?.role === "EMPLOYEE" ? { deletedAt: null, responsibleId: user.id } : { deletedAt: null } }),
      user?.role === "EMPLOYEE" ? Promise.resolve(0) : getOpenExpensesTotal(),
      prisma.lead.groupBy({
        by: ["status"],
        where: visibleLeadWhere,
        _count: { status: true },
      }),
      prisma.lead.findMany({
        where: wonWhere,
        include: { plan: true },
      }),
      prisma.lead.findMany({
        where: chartLeadWhere,
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.chatConversation.findMany({
        where: chartConversationWhere,
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.lead.findMany({
        where: visibleLeadWhere,
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { plan: true, assignedUser: true },
      }),
      Promise.all(dashboardKanbanStatusOrder.map(async (status) => {
        const leads = await prisma.lead.findMany({
          where: { ...visibleLeadWhere, status },
          orderBy: { updatedAt: "desc" },
          take: 3,
          include: { plan: true },
        });
        return {
          status,
          leads: leads.map((lead) => ({
            id: lead.id,
            name: lead.name,
            planName: lead.planName ?? lead.plan?.name ?? lead.notes ?? "Sem interesse",
            updatedAt: lead.updatedAt.toISOString(),
          })),
        };
      })),
    ]);

    const wonValue = wonLeadRows.reduce((sum, lead) => sum + getLeadValue(lead), 0);
    const wonLeads = wonLeadRows.length;
    const planSales = Array.from(
      wonLeadRows.reduce((map, lead) => {
        const key = lead.planId ?? "no-plan";
        const current = map.get(key) ?? {
          planId: lead.planId,
          planName: lead.planName ?? lead.plan?.name ?? "Sem plano",
          count: 0,
          totalValue: 0,
        };
        current.count += 1;
        current.totalValue += getLeadValue(lead);
        map.set(key, current);
        return map;
      }, new Map<string, { planId: string | null; planName: string; count: number; totalValue: number }>()),
    ).map(([, value]) => value);

    return {
      newLeads,
      totalLeads,
      conversations,
      appointments,
      wonLeads,
      totalValue: wonValue,
      expenses,
      showExpenses: user?.role !== "EMPLOYEE",
      leadStatuses: leadStatuses.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      kanbanPreview,
      performanceChart: buildPerformanceChart(chartLeads, chartConversations, filters),
      planSales: planSales.sort((a, b) => b.totalValue - a.totalValue),
      recentLeads: recentLeads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        status: lead.status,
        city: lead.city,
        state: lead.state,
        planName: lead.planName ?? lead.plan?.name ?? null,
        assignedUserName: lead.assignedUser?.name ?? null,
        expectedValue: getLeadValue(lead),
        createdAt: lead.createdAt.toISOString(),
      })),
    };
  }
}

function getLeadValue(lead: { planValue?: unknown; expectedValue: unknown; plan?: { price: unknown } | null }) {
  return Number(lead.planValue ?? lead.expectedValue ?? lead.plan?.price ?? 0);
}

function buildDashboardAccessWhere(user?: Pick<User, "id" | "role">): Prisma.LeadWhereInput {
  if (user?.role !== "EMPLOYEE") {
    return {};
  }

  return { assignedUserId: user.id };
}

function buildWonAccessWhere(user?: Pick<User, "id" | "role">): Prisma.LeadWhereInput {
  if (user?.role !== "EMPLOYEE") {
    return {};
  }

  return {
    OR: [
      { closedByUserId: user.id },
      { closedByUserId: null, assignedUserId: user.id },
    ],
  };
}

async function getOpenExpensesTotal() {
  try {
    const total = await prisma.expense.aggregate({
      where: { deletedAt: null, status: { not: "PAID" } },
      _sum: { amount: true },
    });
    return Number(total._sum.amount ?? 0);
  } catch {
    const fallback = await prisma.appSetting.findUnique({ where: { key: "expenses" } });
    return Number(fallback?.value ?? 0);
  }
}

function buildTodayFilter() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}

function buildDateFilter(filters: DashboardFilters) {
  if (!filters.from && !filters.to) {
    return {};
  }

  return {
    createdAt: {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    },
  };
}

function buildPerformanceChart(leads: Array<{ createdAt: Date }>, conversations: Array<{ createdAt: Date }>, filters: DashboardFilters) {
  const from = filters.from ?? daysAgo(6);
  const to = filters.to ?? new Date();
  const days = Math.max(1, Math.ceil((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000) + 1);
  const buckets = new Map<string, { leads: number; conversations: number }>();

  for (let index = 0; index < days; index += 1) {
    const date = new Date(startOfDay(from));
    date.setDate(date.getDate() + index);
    buckets.set(dateKey(date), { leads: 0, conversations: 0 });
  }

  for (const lead of leads) {
    const key = dateKey(lead.createdAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.leads += 1;
  }

  for (const conversation of conversations) {
    const key = dateKey(conversation.createdAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.conversations += 1;
  }

  return Array.from(buckets.entries()).map(([date, counts]) => ({
    date,
    label: formatShortDate(date),
    leads: counts.leads,
    conversations: counts.conversations,
  }));
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return startOfDay(date);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}
