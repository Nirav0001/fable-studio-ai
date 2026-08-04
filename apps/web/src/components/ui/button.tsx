import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Scoped transition list (never transition-all) + universal press feedback:
  // every variant scales to 0.97 on :active over 160ms ease-out.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform,filter,opacity] duration-200 [transition-timing-function:var(--ease-out)] active:scale-[0.97] active:duration-[160ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "gradient-primary text-white shadow-lg shadow-primary/25 hover:shadow-primary/45 hover:brightness-110",
        secondary:
          "border border-border/70 bg-secondary/70 text-secondary-foreground hover:border-primary/30 hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        outline:
          "border border-border bg-transparent text-foreground hover:border-primary/40 hover:bg-accent/40",
        destructive:
          "border border-destructive/30 bg-destructive/15 text-red-300 hover:bg-destructive/25 hover:text-red-200",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
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
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
