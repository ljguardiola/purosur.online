import {
  type CompromiseResponseItem,
  isResponseCompleted,
  itemRefusal,
} from "../model/compromise-response.js";
import type { CompromiseResponseStore } from "./compromise-response-store.js";

export interface MarkCompromiseResponseItemDonePorts {
  store: CompromiseResponseStore;
}

export interface MarkCompromiseResponseItemDoneInput {
  item: CompromiseResponseItem;
  actorId: string;
  at: Date;
}

export type MarkCompromiseResponseItemDoneOutcome =
  | { kind: "no_running_response" }
  | { kind: "out_of_order" }
  | { kind: "already_done" }
  | { kind: "done"; doneAt: Date };

export async function markCompromiseResponseItemDone(
  { store }: MarkCompromiseResponseItemDonePorts,
  { item, actorId, at }: MarkCompromiseResponseItemDoneInput,
): Promise<MarkCompromiseResponseItemDoneOutcome> {
  return store.transaction<MarkCompromiseResponseItemDoneOutcome>(async (tx) => {
    const latest = await tx.lockLatestResponse();
    if (latest === null || isResponseCompleted(latest.completions)) {
      return { kind: "no_running_response" };
    }
    const refusal = itemRefusal(latest.completions, item);
    if (refusal !== null) {
      return { kind: refusal };
    }
    await tx.recordItemDone(latest.id, item, actorId, at);
    return { kind: "done", doneAt: at };
  });
}
