"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

// 폼 안에서 전송 중이면 자동으로 비활성화되는 제출 버튼.
export function SubmitButton({
  children,
  variant = "secondary",
  size = "sm",
  name,
  value,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  name?: string;
  value?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} name={name} value={value} disabled={pending} className={className} aria-label={ariaLabel}>
      {children}
    </Button>
  );
}
