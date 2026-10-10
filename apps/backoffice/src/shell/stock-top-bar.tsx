import type { ReactNode } from "react";
import { ScreenTitle } from "./screen-title";

export function StockTopBar({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
      <div className="flex flex-col justify-center">
        <p className="text-text-subtle text-detail">Stock</p>
        <ScreenTitle>{title}</ScreenTitle>
      </div>
      {action}
    </div>
  );
}
