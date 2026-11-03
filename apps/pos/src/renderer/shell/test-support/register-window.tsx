import type { ReactNode } from "react";
import { onTestFinished } from "vitest";
import { page } from "vitest/browser";

export const STORE_NOTEBOOK_WINDOW = { width: 1920, height: 1030 };

export function RegisterWindow({ children }: { children: ReactNode }) {
  return <div style={{ height: "100vh" }}>{children}</div>;
}

export async function showInStoreNotebookWindow() {
  await page.viewport(STORE_NOTEBOOK_WINDOW.width, STORE_NOTEBOOK_WINDOW.height);
  onTestFinished(() => page.viewport(414, 896));
}

// Windows draws a vertical scrollbar that takes 17px of the window's width, while the headless
// test browser draws none however it is asked, so that width is held at the window's edge instead.
export function holdWindowsScrollbarWidth() {
  const root = document.documentElement;
  root.style.paddingRight = "17px";
  onTestFinished(() => {
    root.style.removeProperty("padding-right");
  });
}

export function windowOverflow() {
  const root = document.documentElement;
  return {
    vertical: root.scrollHeight - root.clientHeight,
    horizontal: root.scrollWidth - root.clientWidth,
  };
}

export function overflowsItsOwnHeight(element: Element) {
  return element.scrollHeight > element.clientHeight;
}
