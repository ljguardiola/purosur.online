import type { ReactNode } from "react";
import { Toast, type ToastProps } from "./toast";

export type ToastStackProps = {
  toasts: readonly (ToastProps & { id: string })[];
  children: ReactNode;
};

export function ToastStack({ toasts, children }: ToastStackProps) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
      <div className="absolute bottom-16 left-0 z-raised flex flex-col gap-2">
        {toasts.map(({ id, ...toast }) => (
          <Toast key={id} {...toast} />
        ))}
      </div>
    </div>
  );
}
