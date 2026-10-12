import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// containerProps: 가로 스크롤 영역(div)에 붙일 속성. 넓은 표는 키보드로도 스크롤할 수 있도록 tabIndex=0 과 role="region" 을 준다.
export function Table({ className, containerProps, ...props }: ComponentProps<"table"> & { containerProps?: ComponentProps<"div"> }) {
  const { className: containerClassName, ...containerRest } = containerProps ?? {};
  return (
    <div className={cn("w-full overflow-x-auto rounded-lg border border-line", containerClassName)} {...containerRest}>
      <table className={cn("w-full border-collapse text-sm tabular-nums", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-bg-alt text-left text-muted", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={className} {...props} />;
}

export function TH({ className, scope = "col", ...props }: ComponentProps<"th">) {
  return <th scope={scope} className={cn("whitespace-nowrap px-3 py-2 font-semibold", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("whitespace-nowrap px-3 py-2", className)} {...props} />;
}
