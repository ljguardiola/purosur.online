import type { ReactNode } from "react";

export function SupplierItemFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-detail text-text-subtle">{label}</span>
      <span className="text-body font-bold">{children}</span>
    </div>
  );
}
