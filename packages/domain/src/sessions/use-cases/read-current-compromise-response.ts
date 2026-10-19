import type { CompromiseResponses } from "./compromise-response-store.js";
import { type CompromiseResponseView, compromiseResponseView } from "./compromise-response-view.js";

export interface ReadCurrentCompromiseResponsePorts {
  responses: CompromiseResponses;
}

export type ReadCurrentCompromiseResponseOutcome =
  | { kind: "none" }
  | { kind: "found"; response: CompromiseResponseView };

export async function readCurrentCompromiseResponse({
  responses,
}: ReadCurrentCompromiseResponsePorts): Promise<ReadCurrentCompromiseResponseOutcome> {
  const latest = await responses.findLatestResponse();
  return latest === null ? { kind: "none" } : { kind: "found", response: compromiseResponseView(latest) };
}
