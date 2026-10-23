import {
  type FiscalTaskClosingBody,
  type FiscalTasks,
  fiscalTasksSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { readCloudList, sendJson, type WriteFailure, writeFailureOf } from "./fiscal-api-request";

export type CloseFiscalTaskOutcome =
  | { kind: "ok" }
  | { kind: "already_closed" }
  | { kind: "not_found" }
  | WriteFailure;

export function fetchFiscalTasks(): Promise<CloudReadOutcome<FiscalTasks>> {
  return readCloudList("/api/fiscal/tasks", (body) => fiscalTasksSchema.safeParse(body).data);
}

export async function closeFiscalTask(
  taskId: string,
  body: FiscalTaskClosingBody,
): Promise<CloseFiscalTaskOutcome> {
  const response = await sendJson("PUT", `/api/fiscal/tasks/${taskId}/closure`, body);
  if (response === undefined) {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 409) {
    return { kind: "already_closed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return writeFailureOf(response);
}
