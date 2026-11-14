import type { ReactNode } from "react";

export function DimmedPanel({ children }: { children: ReactNode }) {
  return (
    <div inert className="flex opacity-disabled-strong">
      {children}
    </div>
  );
}
