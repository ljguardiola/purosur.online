import { isResponseCompleted } from "../model/compromise-response.js";
import type { CompromiseResponseStore } from "./compromise-response-store.js";
import { type CompromiseResponseView, compromiseResponseView } from "./compromise-response-view.js";

export interface StartCompromiseResponsePorts {
  store: CompromiseResponseStore;
}

export interface StartCompromiseResponseInput {
  actorId: string;
  at: Date;
}

export type StartCompromiseResponseOutcome = {
  kind: "started" | "already_running";
  response: CompromiseResponseView;
};

export async function startCompromiseResponse(
  { store }: StartCompromiseResponsePorts,
  { actorId, at }: StartCompromiseResponseInput,
): Promise<StartCompromiseResponseOutcome> {
  return store.transaction<StartCompromiseResponseOutcome>(async (tx) => {
    const latest = await tx.lockLatestResponse();
    if (latest !== null && !isResponseCompleted(latest.completions)) {
      return { kind: "already_running", response: compromiseResponseView(latest) };
    }
    const started = await tx.startResponse(actorId, at);
    return { kind: "started", response: compromiseResponseView(started) };
  });
}
