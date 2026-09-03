"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { navigationItems } from "@/config/navigation";
import { clearCurrentUserCache, useCurrentUser } from "@/hooks/use-current-user";

export function Sidebar() {
  const { data: user } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const visibleItems = navigationItems.filter(
    (item) => user?.role === "ADMIN" || ("employeeVisible" in item) || (!("adminOnly" in item) && Boolean(user?.permissions?.[item.permission])),
  );

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearCurrentUserCache();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[247px] border-r border-blue-400/15 bg-[#020d20]/90 text-white shadow-[18px_0_60px_rgba(0,0,0,0.25)] backdrop-blur-xl md:block">
      <div className="flex h-full flex-col">
        <div className="flex h-[76px] items-center border-b border-blue-400/15 px-[12px]">
          <BrandLogo className="h-[58px] w-[222px]" priority />
        </div>
        <nav className="flex-1 space-y-[14px] px-[16px] py-[38px]">
          {visibleItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-4 rounded-[8px] border px-4 py-[14px] text-[14px] font-medium transition-all ${
                  active
                    ? "border-primary/60 bg-[linear-gradient(135deg,rgba(0,102,255,0.45),rgba(3,25,54,0.7))] text-white shadow-[0_0_28px_rgba(14,115,216,0.22)]"
                    : "border-transparent text-slate-300 hover:border-blue-400/20 hover:bg-blue-500/10 hover:text-white"
                }`}
              >
                <item.icon className={`h-5 w-5 ${active ? "text-white" : "text-slate-300 group-hover:text-blue-200"}`} aria-hidden="true" />
                {item.title}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-blue-400/15 p-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-blue-300/25 bg-primary text-lg font-semibold text-white shadow-[0_0_24px_rgba(14,115,216,0.3)]">
              {(user?.name ?? "A").slice(0, 1).toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#020d20] bg-lime-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400">{user?.role === "ADMIN" ? "Administrador" : "Operador"}</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{user?.name ?? "Usuario"}</p>
            </div>
          </div>
          <button
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-[8px] border border-blue-400/20 bg-blue-500/10 px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:border-primary/50 hover:bg-primary/15 hover:text-white"
            onClick={() => void logout()}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
