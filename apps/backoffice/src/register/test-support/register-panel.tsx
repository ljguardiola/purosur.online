import { vi } from "vitest";
import type { RegisterActions } from "../register-row-actions";
import type { RegisterSummary } from "../registers-api";
import type { RegistersListScreenServices } from "../registers-list-services";
import { createServices } from "./registers-list-screen";

function action() {
  return vi.fn<(register: RegisterSummary) => void>();
}

export function createActions() {
  return {
    emitCode: action(),
    revoke: action(),
    loadKey: action(),
    consultKey: action(),
    assignTerminal: action(),
    assignQr: action(),
  } satisfies RegisterActions;
}

export function panelServices(
  overrides: Partial<RegistersListScreenServices> = {},
): RegistersListScreenServices {
  return createServices(overrides);
}
