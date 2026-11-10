import { onTestFinished } from "vitest";

export function escapeHandled(): () => boolean {
  let handled = false;
  const record = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      handled = event.defaultPrevented;
    }
  };
  window.addEventListener("keydown", record);
  onTestFinished(() => window.removeEventListener("keydown", record));
  return () => handled;
}
