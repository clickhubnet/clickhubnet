"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/config/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";

export function MobileNav() {
  const { data: user } = useCurrentUser();
  const pathname = usePathname();
  const visibleItems = navigationItems.filter(
    (item) => user?.role === "ADMIN" || ("employeeVisible" in item) || (!("adminOnly" in item) && Boolean(user?.permissions?.[item.permission])),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-blue-400/15 bg-[#020d20]/90 px-2 py-2 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {visibleItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl border text-[10px] font-medium transition-colors ${
                active
                  ? "border-primary/50 bg-primary/20 text-white"
                  : "border-transparent text-slate-400 hover:bg-blue-500/10 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              <span className="max-w-full truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
