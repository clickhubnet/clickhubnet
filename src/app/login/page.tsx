import { Suspense } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { appConfig } from "@/config/app";
import { LoginForm } from "@/modules/usuarios/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,#032a66_0%,#0d5fb6_52%,#0e73d8_100%)] px-4 text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <div className="mb-8 text-center">
          <BrandLogo className="mx-auto mb-4 h-44 w-full max-w-[320px]" priority />
          <h1 className="text-2xl font-semibold">{appConfig.name}</h1>
          <p className="mt-1 text-sm text-blue-100">Painel comercial</p>
        </div>
        <Suspense fallback={<div className="h-48 rounded-md bg-white/5" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
