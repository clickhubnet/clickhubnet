"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, KeyRound, Moon, Save, ShieldCheck, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { appConfig } from "@/config/app";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { ApiResult } from "@/types/api";

export function SettingsPanel() {
  const user = useCurrentUser();
  const { setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark">("light");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const themeChangedByUser = useRef(false);
  const isAdmin = user.data?.role === "ADMIN";

  useEffect(() => {
    if (!themeChangedByUser.current && (user.data?.theme === "dark" || user.data?.theme === "light")) {
      setSelectedTheme(user.data.theme);
      setTheme(user.data.theme);
    }
  }, [setTheme, user.data?.theme]);

  async function changeTheme(nextTheme: "light" | "dark") {
    if (!user.data) return;
    themeChangedByUser.current = true;
    setSelectedTheme(nextTheme);
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("theme", nextTheme);
    setProfileMessage("Salvando preferência de tema...");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        user.data.role === "ADMIN"
          ? { name: user.data.name, email: user.data.email, theme: nextTheme }
          : { theme: nextTheme },
      ),
    });
    const result = (await response.json()) as ApiResult<unknown>;
    setProfileMessage(result.message);
    if (response.ok) await user.refresh();
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setProfileMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), email: data.get("email"), theme: selectedTheme }) });
    const result = (await response.json()) as ApiResult<unknown>;
    setProfileMessage(result.message); setSaving(false);
    if (response.ok) await user.refresh();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setPasswordMessage("");
    const form = event.currentTarget; const data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) { setPasswordMessage("A confirmação da nova senha não confere."); setSaving(false); return; }
    const response = await fetch("/api/profile/password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }) });
    const result = (await response.json()) as ApiResult<unknown>;
    setPasswordMessage(result.message); setSaving(false); if (response.ok) form.reset();
  }

  return <div className={`grid gap-4 ${isAdmin ? "xl:grid-cols-[1.1fr_0.9fr]" : "max-w-xl"}`}>
    <div className="space-y-4">
      {isAdmin ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="h-5 w-5" />Meu perfil</CardTitle><CardDescription>Nome e e-mail utilizados para acessar o sistema</CardDescription></CardHeader><CardContent>
        <form key={`${user.data?.name}-${user.data?.email}`} className="space-y-4" onSubmit={saveProfile}>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Nome completo</span><Input name="name" defaultValue={user.data?.name ?? ""} required /></label><label className="space-y-1 text-sm"><span>Login de acesso (e-mail)</span><Input name="email" type="email" defaultValue={user.data?.email ?? ""} required /></label></div>
          <fieldset><legend className="mb-2 text-sm font-medium">Tema do sistema</legend><div className="grid grid-cols-2 gap-3"><ThemeOption label="Claro" icon={<Sun className="h-5 w-5" />} selected={selectedTheme === "light"} onClick={() => void changeTheme("light")} /><ThemeOption label="Escuro" icon={<Moon className="h-5 w-5" />} selected={selectedTheme === "dark"} onClick={() => void changeTheme("dark")} /></div><p className="mt-2 text-xs text-muted-foreground">A mudança é aplicada e salva imediatamente.</p></fieldset>
          {profileMessage && <p className="text-sm text-muted-foreground">{profileMessage}</p>}<Button disabled={saving}><Save className="h-4 w-4" />Salvar perfil</Button>
        </form>
      </CardContent></Card> : null}

      {!isAdmin ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><Moon className="h-5 w-5" />Tema do sistema</CardTitle><CardDescription>Escolha a aparência do seu acesso</CardDescription></CardHeader><CardContent>
        <div className="grid grid-cols-2 gap-3"><ThemeOption label="Claro" icon={<Sun className="h-5 w-5" />} selected={selectedTheme === "light"} onClick={() => void changeTheme("light")} /><ThemeOption label="Escuro" icon={<Moon className="h-5 w-5" />} selected={selectedTheme === "dark"} onClick={() => void changeTheme("dark")} /></div>
        {profileMessage && <p className="mt-3 text-sm text-muted-foreground">{profileMessage}</p>}
      </CardContent></Card> : null}

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Alterar senha</CardTitle><CardDescription>Use uma senha com pelo menos oito caracteres</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={changePassword}><Input name="currentPassword" type="password" placeholder="Senha atual" required /><Input name="newPassword" type="password" minLength={8} placeholder="Nova senha" required /><Input name="confirmPassword" type="password" minLength={8} placeholder="Confirmar nova senha" required />{passwordMessage && <p className="text-sm text-muted-foreground">{passwordMessage}</p>}<Button disabled={saving}><ShieldCheck className="h-4 w-4" />Alterar senha</Button></form></CardContent></Card>
    </div>

    {isAdmin ? <Card className="h-fit"><CardHeader><CardTitle>Informações do Sistema</CardTitle><CardDescription>Identificação desta instalação</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid grid-cols-2 gap-3"><Info label="Versão" value={appConfig.version} /><Info label="Licença" value={appConfig.license} /></div><div className="border-t border-blue-400/15 pt-5"><p className="mb-4 text-center text-sm text-muted-foreground">Desenvolvido por:</p><div className="flex min-h-32 items-center justify-center rounded-xl border border-blue-400/15 bg-white/5 p-5"><img src="/brand/peraxis-logo.png" alt="PERAXIS Desenvolvimento e Automações" className="block h-auto max-h-24 w-full max-w-[520px] object-contain" /></div></div></CardContent></Card> : null}
  </div>;
}

function ThemeOption({ label, icon, selected, onClick }: { label: string; icon: React.ReactNode; selected: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`relative flex h-20 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors ${selected ? "border-primary bg-primary/10 text-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}>{icon}{label}{selected && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}</button>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
