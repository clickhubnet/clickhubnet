import { Suspense } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { appConfig } from "@/config/app";
import { LoginForm } from "@/modules/usuarios/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_40%_0%,rgba(14,115,216,0.28),transparent_28rem),radial-gradient(circle_at_78%_72%,rgba(26,255,130,0.08),transparent_18rem)]" />
      <div className="glass-panel neon-ring relative w-full max-w-md rounded-[2rem] p-7 shadow-2xl">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-4 h-40 w-full max-w-[300px]" priority />
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">{appConfig.name}</h1>
          <p className="mt-1 text-sm text-slate-300">Painel comercial</p>
        </div>
        <Suspense fallback={<div className="h-48 rounded-xl bg-white/5" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
