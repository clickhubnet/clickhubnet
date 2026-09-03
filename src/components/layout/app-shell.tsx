import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { CurrentUserProvider } from "@/hooks/use-current-user";

type AppShellProps = {
  title: string;
  children: React.ReactNode;
};

export function AppShell({ title, children }: AppShellProps) {
  return (
    <CurrentUserProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Sidebar />
        <div className="min-h-screen md:pl-[247px]">
          <Header title={title} />
          <main className="mx-auto w-full max-w-[1536px] px-4 py-[22px] pb-24 sm:px-6 md:pb-6 lg:px-10">
            <div className="mb-[16px]">
              <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.04em] text-[#d7def0]">{title}</h1>
              <p className="mt-1 text-sm text-[#95a3bd]">Visão geral do seu negócio</p>
            </div>
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    </CurrentUserProvider>
  );
}
