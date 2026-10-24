import type { CloseFiscalTaskModalServices } from "./close-fiscal-task-modal";
import { closeFiscalTask, fetchFiscalTasks } from "./fiscal-tasks-api";

export type FiscalTasksScreenServices = CloseFiscalTaskModalServices & {
  fetchFiscalTasks: typeof fetchFiscalTasks;
};

export const defaultFiscalTasksScreenServices: FiscalTasksScreenServices = {
  fetchFiscalTasks,
  closeFiscalTask,
};
