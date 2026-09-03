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
        <div className="min-h-screen md:pl-[19rem]">
          <Header title={title} />
          <main className="mx-auto w-full max-w-[1536px] px-4 py-6 pb-24 sm:px-6 md:pb-6 lg:px-10">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    </CurrentUserProvider>
  );
}
