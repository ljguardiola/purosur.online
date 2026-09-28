import type { ReactNode } from "react";
import { focusRingClassName } from "../platform/focus-ring";

export function ScreenTitle({ children }: { children: ReactNode }) {
  return (
    <h1 tabIndex={-1} className={`font-bold text-2xl text-text-accent ${focusRingClassName}`}>
      {children}
    </h1>
  );
}

export function focusScreenTitle() {
  document.querySelector<HTMLElement>("h1")?.focus();
}
