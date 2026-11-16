import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type Variant = ButtonVariant;
export type ButtonSize = "sm" | "md";
type Size = ButtonSize;

// Shared with ui/LinkButton, so a link that looks like a button can never drift from it.
export const BUTTON_BASE =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-field font-medium transition-colors duration-(--dur-fast)";

export const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "border border-line bg-raised text-ink hover:bg-hover",
  ghost: "text-ink hover:bg-hover",
  danger: "bg-danger-fill text-accent-fg hover:opacity-90",
};

// Design tokens: 36 px (control-lg) with a mouse, 32 px for sm, 44 px on touch screens; 13 px medium text.
export const SIZES: Record<Size, string> = {
  sm: "h-control-md px-3 text-label touch:h-touch",
  md: "h-control px-3 text-label touch:h-touch",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-field font-medium transition-colors duration-(--dur-fast) disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} label="" /> : icon}
      {children}
    </button>
  );
});
