import type { ReactNode } from "react";
import { ScreenTitle } from "./screen-title";

export function AreaTopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-18 shrink-0 items-center gap-4 border-border border-b bg-surface px-8">
      <div className="flex flex-1 flex-col justify-center">
        <ScreenTitle>{title}</ScreenTitle>
      </div>
      {action}
    </div>
  );
}
