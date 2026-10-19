import {
  actionStepRefusal,
  type CompromiseResponseAction,
  isResponseCompleted,
  type PasskeyRemovalRefusal,
  passkeyRemovalSettlesAccount,
} from "../model/compromise-response.js";
import type { CompromiseResponseActions } from "./compromise-response-actions.js";
import type { CompromiseResponseStore } from "./compromise-response-store.js";

export interface RunCompromiseResponseStepPorts {
  store: CompromiseResponseStore;
  actions: CompromiseResponseActions;
}

export type RunCompromiseResponseStepInput = { actorId: string; at: Date } & (
  | { step: "revoke_every_installation" }
  | { step: "end_sessions_and_remove_passkeys"; accountId: string }
  | { step: "force_pin_resets" }
);

export type RunCompromiseResponseStepOutcome =
  | { kind: "no_running_response" }
  | { kind: "out_of_order" }
  | { kind: "already_done" }
  | { kind: "action_refused"; refusal: PasskeyRemovalRefusal }
  | { kind: "done"; doneAt: Date };

async function runAction(
  actions: CompromiseResponseActions,
  input: RunCompromiseResponseStepInput,
): Promise<PasskeyRemovalRefusal | null> {
  switch (input.step) {
    case "revoke_every_installation":
      await actions.revokeEveryInstallation();
      return null;
    case "end_sessions_and_remove_passkeys": {
      const { kind } = await actions.removeAccountPasskeys(input.accountId);
      if (!passkeyRemovalSettlesAccount(kind)) {
        return kind;
      }
      await actions.endEveryBackofficeSession();
      return null;
    }
    case "force_pin_resets":
      await actions.requirePinResetOfEveryUser();
      return null;
  }
}

export async function runCompromiseResponseStep(
  { store, actions }: RunCompromiseResponseStepPorts,
  input: RunCompromiseResponseStepInput,
): Promise<RunCompromiseResponseStepOutcome> {
  const step: CompromiseResponseAction = input.step;
  const refused = await store.transaction<RunCompromiseResponseStepOutcome | null>(async (tx) => {
    const latest = await tx.lockLatestResponse();
    if (latest === null || isResponseCompleted(latest.completions)) {
      return { kind: "no_running_response" };
    }
    const refusal = actionStepRefusal(latest.completions, step);
    return refusal === null ? null : { kind: refusal };
  });
  if (refused !== null) {
    return refused;
  }

  const actionRefusal = await runAction(actions, input);
  if (actionRefusal !== null) {
    return { kind: "action_refused", refusal: actionRefusal };
  }

  return store.transaction<RunCompromiseResponseStepOutcome>(async (tx) => {
    const latest = await tx.lockLatestResponse();
    if (latest === null || actionStepRefusal(latest.completions, step) !== null) {
      return { kind: "already_done" };
    }
    await tx.recordStepDone(latest.id, step, input.actorId, input.at);
    return { kind: "done", doneAt: input.at };
  });
}
