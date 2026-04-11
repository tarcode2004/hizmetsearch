import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Variant-driven button with built-in press state and loading prop.
 * Wraps all interactive "do something" affordances across the app.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5",
    "font-medium whitespace-nowrap shrink-0",
    "transition-[background-color,color,border-color,box-shadow,transform] duration-150",
    "active:scale-[0.98] active:duration-75",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90",
          "shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]",
        ].join(" "),
        outline: [
          "border border-border bg-card text-foreground",
          "hover:bg-muted hover:border-primary/30",
        ].join(" "),
        ghost: [
          "bg-transparent text-foreground",
          "hover:bg-muted",
        ].join(" "),
        soft: [
          "bg-primary/10 text-primary",
          "hover:bg-primary/15",
        ].join(" "),
        destructive: [
          "bg-destructive text-white",
          "hover:bg-destructive/90",
          "shadow-[var(--shadow-sm)]",
        ].join(" "),
        link: [
          "bg-transparent text-primary underline-offset-4",
          "hover:underline",
          "active:scale-100",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-9 px-4 text-sm rounded-lg",
        lg: "h-11 px-5 text-base rounded-xl",
        xl: "h-14 px-6 text-base rounded-2xl",
        icon: "h-9 w-9 rounded-lg p-0",
        "icon-sm": "h-7 w-7 rounded-md p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, leftIcon, rightIcon, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export { buttonVariants };
