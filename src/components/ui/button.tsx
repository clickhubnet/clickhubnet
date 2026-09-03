import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-blue-300/20 bg-primary text-primary-foreground shadow-[0_0_24px_rgba(14,115,216,0.28)] hover:bg-blue-500",
        secondary: "border border-blue-300/15 bg-blue-500/12 text-blue-50 hover:bg-blue-500/20",
        outline: "border border-blue-300/20 bg-[#031936]/70 text-blue-50 hover:border-primary/60 hover:bg-primary/12",
        ghost: "text-slate-200 hover:bg-blue-500/12 hover:text-white",
        destructive: "border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        icon: "h-10 w-10 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
