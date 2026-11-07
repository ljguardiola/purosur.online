import { vi } from "vitest";
import type { ExceptionalitySectionServices } from "../exceptionality-section";

export function createExceptionalityServices(): ExceptionalitySectionServices {
  return { fetchFiscalAddresses: vi.fn(), fetchExceptionShareYear: vi.fn() };
}
