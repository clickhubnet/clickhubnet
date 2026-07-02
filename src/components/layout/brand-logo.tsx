import { cn } from "@/utils/cn";
import { appConfig } from "@/config/app";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function BrandLogo({
  compact = false,
  className,
  imageClassName,
  priority = false,
}: BrandLogoProps) {
  const src = compact ? "/brand/logo-central.svg" : "/brand/logo-central-real.png";
  const alt = compact ? appConfig.shortName : appConfig.name;

  return (
    <div className={cn("relative overflow-hidden", compact ? "h-12 w-12" : "h-40 w-72", className)}>
      <img
        src={src}
        alt={alt}
        className={cn("h-full w-full object-contain", compact ? "p-0.5" : "", imageClassName)}
        loading={priority ? "eager" : "lazy"}
      />
    </div>
  );
}
