import { mapCloudData } from "../platform/map-cloud-data";
import type { CloudData } from "../platform/use-cloud-query";
import { useFiscalTasksQuery } from "./fiscal-queries";
import type { fetchFiscalTasks } from "./fiscal-tasks-api";

export function usePendingFiscalTasksCount(params: {
  enabled: boolean;
  fetchFiscalTasks: typeof fetchFiscalTasks;
  onSessionEnded: () => void;
}): CloudData<number> {
  return mapCloudData(useFiscalTasksQuery(params), (read) => read.tasks.length);
}
