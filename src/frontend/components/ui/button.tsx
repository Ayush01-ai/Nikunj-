import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-cinzel text-xs tracking-widest uppercase transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // ─── Gold (Primary) ─── maps to the old .btn-gold
        default:
          "btn-gold text-white",
        // ─── Outline Gold ───
        outline:
          "border-2 border-gold text-gold-dark bg-white/80 hover:bg-gold-dark hover:text-white transition-colors",
        // ─── Ghost ───
        ghost:
          "text-gold-dark hover:bg-gold/15",
        // ─── Destructive ───
        destructive:
          "bg-red-500 text-white hover:bg-red-600",
        // ─── Link style ───
        link:
          "text-gold underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "px-7 py-3.5",
        sm: "px-4 py-2 text-xs",
        lg: "px-10 py-4 text-sm",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
