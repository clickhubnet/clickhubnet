import {
  BarChart3,
  Bot,
  CalendarCheck,
  ReceiptText,
  MapPinned,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { permissions } from "@/constants/permissions";

export const navigationItems = [
  { title: "Dashboard", href: "/dashboard", icon: BarChart3, permission: permissions.dashboardView },
  { title: "Leads", href: "/leads", icon: Users, permission: permissions.leadsView },
  { title: "Compromissos", href: "/compromissos", icon: CalendarCheck, permission: permissions.appointmentsView },
  { title: "Despesas", href: "/despesas", icon: ReceiptText, permission: permissions.expensesView },
  { title: "N8N", href: "/n8n", icon: Workflow, permission: permissions.agentsEdit },
  { title: "Usuários", href: "/usuarios", icon: Bot, permission: permissions.usersEdit, adminOnly: true },
  { title: "CEPs", href: "/ceps", icon: MapPinned, permission: permissions.cepsView },
  { title: "Configurações", href: "/configuracoes", icon: Settings, permission: permissions.settingsView, employeeVisible: true },
] as const;
