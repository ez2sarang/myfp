import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-btn text-btn-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(11_18_32/0.12)] hover:bg-btn-hover",
  secondary: "border border-line-strong bg-surface text-ink shadow-card hover:border-ink/30 hover:bg-surface-2",
  ghost: "text-ink hover:bg-bg-alt",
  danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 rounded-sm px-3 text-sm",
  md: "min-h-11 rounded-md px-4 text-[0.95rem]",
  lg: "min-h-12 rounded-md px-5 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-tight transition-[background-color,border-color,color,opacity]",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
