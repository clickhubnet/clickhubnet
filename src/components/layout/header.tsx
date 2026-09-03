"use client";

import { useEffect } from "react";
import { Bell, CalendarDays, ChevronDown, Menu, Search } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearCurrentUserCache, useCurrentUser } from "@/hooks/use-current-user";

type HeaderProps = {
  title: string;
};

export function Header({ title: _title }: HeaderProps) {
  const { setTheme } = useTheme();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { data: user } = currentUser;
  const now = new Date();
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(now);
  const today = `${String(now.getDate()).padStart(2, "0")} de ${month.charAt(0).toUpperCase()}${month.slice(1)}, ${now.getFullYear()}`;

  useEffect(() => {
    setTheme("dark");
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }, [setTheme]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearCurrentUserCache();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-blue-400/15 bg-[#020d20]/78 backdrop-blur-xl">
      <div className="flex h-[67px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button className="hidden md:inline-flex" variant="outline" size="icon" type="button" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative hidden w-[260px] xl:block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input className="h-11 pl-9" placeholder="Buscar..." aria-label="Buscar" />
          </div>
          <Button variant="outline" size="icon" type="button" aria-label="Notificações" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">3</span>
          </Button>
          <Button variant="outline" type="button" className="hidden h-11 px-4 text-slate-300 lg:inline-flex">
            <CalendarDays className="h-4 w-4" />
            {today}
            <ChevronDown className="h-4 w-4" />
          </Button>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user?.name ?? "Usuário"}</p>
            <button className="text-xs text-slate-400 hover:text-white" onClick={logout} type="button">
              Sair
            </button>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-300/25 bg-primary text-sm font-bold text-primary-foreground shadow-[0_0_24px_rgba(14,115,216,0.35)]">
            {(user?.name ?? "A").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
