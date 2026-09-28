import { PuroSurLogo } from "@purosur/ui";
import type { ReactNode } from "react";

export function BrandPanelScreen({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-screen w-screen bg-surface">
      <div className="flex w-2/5 min-w-80 items-center justify-center bg-surface-soft">
        <PuroSurLogo className="h-[164px] w-[420px] object-contain" />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">{children}</div>
    </div>
  );
}
