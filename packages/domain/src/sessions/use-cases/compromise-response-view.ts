import {
  type CompromiseResponseItemState,
  type CompromiseResponseStepState,
  isResponseCompleted,
  itemStates,
  stepStates,
} from "../model/compromise-response.js";
import type { StoredCompromiseResponse } from "./compromise-response-store.js";

export interface CompromiseResponseView {
  id: string;
  startedAt: Date;
  startedBy: string;
  completed: boolean;
  steps: CompromiseResponseStepState[];
  items: CompromiseResponseItemState[];
}

export function compromiseResponseView(stored: StoredCompromiseResponse): CompromiseResponseView {
  return {
    id: stored.id,
    startedAt: stored.startedAt,
    startedBy: stored.startedBy,
    completed: isResponseCompleted(stored.completions),
    steps: stepStates(stored.completions),
    items: itemStates(stored.completions),
  };
}
