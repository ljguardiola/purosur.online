import { fetchFiscalTasks } from "./fiscal-tasks-api";

export type FiscalTasksScreenServices = {
  fetchFiscalTasks: typeof fetchFiscalTasks;
};

export const defaultFiscalTasksScreenServices: FiscalTasksScreenServices = {
  fetchFiscalTasks,
};
