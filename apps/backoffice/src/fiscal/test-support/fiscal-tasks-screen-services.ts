import { vi } from "vitest";
import type { FiscalTasksScreenServices } from "../fiscal-tasks-services";

export function createFiscalTasksServices(): FiscalTasksScreenServices {
  return { fetchFiscalTasks: vi.fn() };
}
