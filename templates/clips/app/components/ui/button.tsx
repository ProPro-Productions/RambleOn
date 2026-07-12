import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// Plastic 3D (see DESIGN.md): every button is physically raised — multi-layer
// shadows, hover lifts one pixel, active presses back down. Primary and
// destructive add a top→bottom gradient overlay for gloss.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary [background-image:linear-gradient(to_bottom,hsl(0_0%_100%/10%),hsl(0_0%_0%/6%))] text-primary-foreground shadow-3d-btn hover:bg-primary/90 hover:shadow-3d-btn-hover hover:-translate-y-px active:shadow-3d-btn-active active:translate-y-0 active:[background-image:linear-gradient(to_bottom,hsl(0_0%_0%/4%),hsl(0_0%_0%/10%))]",
        destructive:
          "bg-destructive [background-image:linear-gradient(to_bottom,hsl(0_0%_100%/10%),hsl(0_0%_0%/6%))] text-destructive-foreground shadow-3d-btn hover:bg-destructive/90 hover:shadow-3d-btn-hover hover:-translate-y-px active:shadow-3d-btn-active active:translate-y-0 active:[background-image:linear-gradient(to_bottom,hsl(0_0%_0%/4%),hsl(0_0%_0%/10%))]",
        outline:
          "border border-input bg-background shadow-3d-sm hover:bg-accent hover:text-accent-foreground hover:shadow-3d-md hover:-translate-y-px active:shadow-3d-inner-sm active:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground shadow-3d-sm hover:bg-secondary/80 hover:shadow-3d-md hover:-translate-y-px active:shadow-3d-inner-sm active:translate-y-0",
        ghost:
          "hover:bg-accent hover:text-accent-foreground hover:shadow-3d-xs",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
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
