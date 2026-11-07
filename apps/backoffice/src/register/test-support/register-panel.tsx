import { vi } from "vitest";
import type { RegisterActions } from "../register-action-modals";
import type { RegistersListScreenServices } from "../registers-list-services";
import { createServices } from "./registers-list-screen";

export function createActions(): { [Name in keyof RegisterActions]: ReturnType<typeof vi.fn> } {
  return {
    emitCode: vi.fn(),
    revoke: vi.fn(),
    loadKey: vi.fn(),
    consultKey: vi.fn(),
    assignTerminal: vi.fn(),
    assignQr: vi.fn(),
  };
}

export function panelServices(
  overrides: Partial<RegistersListScreenServices> = {},
): RegistersListScreenServices {
  return createServices(overrides);
}
