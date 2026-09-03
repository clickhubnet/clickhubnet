import Link from "next/link";

type MetricCardProps = {
  title: string;
  value: string;
  trend: string;
  color: "blue" | "green" | "purple" | "orange";
  href?: string;
};

const cardColors = {
  blue: { stroke: "#1684ff", fill: "rgba(22,132,255,0.22)" },
  green: { stroke: "#30d83f", fill: "rgba(48,216,63,0.18)" },
  purple: { stroke: "#8738ff", fill: "rgba(135,56,255,0.22)" },
  orange: { stroke: "#ff8a00", fill: "rgba(255,138,0,0.22)" },
};

export function MetricCard({ title, value, trend, color, href }: MetricCardProps) {
  const chart = cardColors[color];
  const gradientId = `metric-${color}-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const card = (
    <div className="relative h-[200px] overflow-hidden rounded-[12px] border border-[#0c3569] bg-[linear-gradient(180deg,rgba(3,26,59,0.98),rgba(2,23,52,0.98))] shadow-[0_20px_50px_rgba(0,11,30,0.28)] transition-transform hover:-translate-y-0.5">
      <div className="relative z-10 flex h-full items-start justify-between px-[18px] py-[20px]">
        <div>
          <p className="text-[14px] font-medium text-[#aeb9cf]">{title}</p>
          <p className="mt-[22px] text-[30px] font-semibold leading-none tracking-[-0.035em] text-white">{value}</p>
          <p className="mt-[12px] text-[12px]">
            <span className="font-semibold text-[#39ff45]">↑ {trend}</span>
            <span className="ml-2 text-[#93a4c5]">vs mês anterior</span>
          </p>
        </div>
        <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#7d93bc] text-[12px] font-medium text-[#9fb0ce]">
          i
        </div>
      </div>
      <svg className="absolute bottom-[20px] left-[18px] h-[86px] w-[calc(100%-36px)]" viewBox="0 0 280 86" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor={chart.fill} />
            <stop offset="1" stopColor="rgba(3,24,54,0)" />
          </linearGradient>
        </defs>
        <path d="M0 73 C18 65 22 62 37 63 C52 64 57 49 72 51 C88 53 93 42 108 43 C124 44 127 55 143 53 C160 51 164 38 179 39 C195 40 199 30 214 29 C230 28 234 39 249 35 C264 31 264 20 280 18 L280 86 L0 86 Z" fill={`url(#${gradientId})`} />
        <path d="M0 73 C18 65 22 62 37 63 C52 64 57 49 72 51 C88 53 93 42 108 43 C124 44 127 55 143 53 C160 51 164 38 179 39 C195 40 199 30 214 29 C230 28 234 39 249 35 C264 31 264 20 280 18" fill="none" stroke={chart.stroke} strokeLinecap="round" strokeWidth="2" />
      </svg>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }

  return card;
}
