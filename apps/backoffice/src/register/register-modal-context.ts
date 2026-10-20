import type { RegisterSummary } from "./registers-api";

export function registerModalContext(register: RegisterSummary | null): string {
  if (register === null) {
    return "";
  }
  return register.installation === null
    ? register.name
    : `${register.name} · ${register.installation.hostname}`;
}
