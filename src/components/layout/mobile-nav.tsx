"use client";

import Link from "next/link";
import { navigationItems } from "@/config/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";

export function MobileNav() {
  const { data: user } = useCurrentUser();
  const visibleItems = navigationItems.filter(
    (item) => user?.role === "ADMIN" || ("employeeVisible" in item) || (!("adminOnly" in item) && Boolean(user?.permissions?.[item.permission])),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 py-2 backdrop-blur md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            <span className="max-w-full truncate">{item.title}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
