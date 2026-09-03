import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

type MetricCardProps = {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  href?: string;
};

export function MetricCard({ title, value, helper, icon: Icon, href }: MetricCardProps) {
  const card = (
    <Card className="relative min-h-40 overflow-hidden transition-transform hover:-translate-y-0.5">
      <CardContent className="relative z-10 flex h-full items-start justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">{value}</p>
          <p className="mt-2 text-xs text-emerald-400">↑ {helper}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-300/20 bg-blue-500/10 text-blue-200">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </CardContent>
      <svg className="absolute bottom-0 left-0 h-24 w-full opacity-90" viewBox="0 0 320 96" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`metric-${title.replace(/\s+/g, "-")}`} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#0e73d8" stopOpacity="0.35" />
            <stop offset="1" stopColor="#0e73d8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 82 C28 72 34 64 58 67 C90 71 86 42 118 49 C150 56 151 32 184 39 C218 46 211 18 245 23 C278 28 278 10 320 14 L320 96 L0 96 Z" fill={`url(#metric-${title.replace(/\s+/g, "-")})`} />
        <path d="M0 82 C28 72 34 64 58 67 C90 71 86 42 118 49 C150 56 151 32 184 39 C218 46 211 18 245 23 C278 28 278 10 320 14" fill="none" stroke="#158cff" strokeWidth="2.5" />
      </svg>
    </Card>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}
