"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/layout/brand-logo";
import { appConfig } from "@/config/app";
import { Button } from "@/components/ui/button";
import { clearCurrentUserCache, useCurrentUser } from "@/hooks/use-current-user";

type HeaderProps = {
  title: string;
};

export function Header({ title }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { data: user } = currentUser;
  const isDark = theme === "dark";

  useEffect(() => {
    if (!user) return;
    setTheme(user.theme === "dark" ? "dark" : "light");
  }, [setTheme, user?.id, user?.theme]);

  async function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: nextTheme }),
    });
    await currentUser.refresh();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearCurrentUserCache();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo compact className="h-10 w-10 md:hidden" imageClassName="p-0.5" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-normal">{title}</h1>
            <p className="truncate text-xs text-muted-foreground">{appConfig.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            type="button"
            aria-label="Alternar tema"
            title="Alternar tema"
            onClick={() => void toggleTheme()}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{user?.name ?? "Usuário"}</p>
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={logout} type="button">
              Sair
            </button>
          </div>
          <div className="h-10 w-10 rounded-md bg-primary text-center text-sm font-bold leading-10 text-primary-foreground shadow-sm">
            {(user?.name ?? "A").slice(0, 1).toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
