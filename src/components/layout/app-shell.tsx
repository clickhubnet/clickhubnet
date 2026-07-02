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
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="min-h-screen md:pl-64">
          <Header title={title} />
          <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 sm:px-6 md:pb-5 lg:px-8">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
    </CurrentUserProvider>
  );
}
