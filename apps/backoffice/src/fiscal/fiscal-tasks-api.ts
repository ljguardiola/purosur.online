import { type FiscalTasks, fiscalTasksSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList } from "./fiscal-api-request";

export function fetchFiscalTasks(): Promise<CloudReadOutcome<FiscalTasks>> {
  return readCloudList("/api/fiscal/tasks", (body) => fiscalTasksSchema.safeParse(body).data);
}
