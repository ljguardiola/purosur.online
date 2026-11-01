import { vi } from "vitest";
import type { ExceptionalityScreenServices } from "../exceptionality-services";

export function createExceptionalityServices(): ExceptionalityScreenServices {
  return { fetchFiscalAddresses: vi.fn(), fetchExceptionShareYear: vi.fn() };
}
