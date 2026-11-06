import { mapCloudData } from "../platform/map-cloud-data";
import type { CloudData } from "../platform/use-cloud-query";
import type { fetchFiscalTasks } from "./fiscal-tasks-api";
import { useFiscalTasksQuery } from "./fiscal-queries";

export function usePendingFiscalTasksCount(params: {
  enabled: boolean;
  fetchFiscalTasks: typeof fetchFiscalTasks;
  onSessionEnded: () => void;
}): CloudData<number> {
  return mapCloudData(useFiscalTasksQuery(params), (read) => read.tasks.length);
}
