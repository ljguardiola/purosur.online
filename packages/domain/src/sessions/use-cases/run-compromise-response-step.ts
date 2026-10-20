import {
  actionStepRefusal,
  type CompromiseResponseAction,
  isResponseCompleted,
  type PasskeyRemovalRefusal,
  passkeyRemovalSettlesAccount,
} from "../model/compromise-response.js";
import type {
  CompromiseResponseStore,
  CompromiseResponseStoreTransaction,
} from "./compromise-response-store.js";

export interface RunCompromiseResponseStepPorts {
  store: CompromiseResponseStore;
}

export type CompromiseResponseStepRequest =
  | { step: "revoke_every_installation" }
  | { step: "end_sessions_and_remove_passkeys"; accountId: string }
  | { step: "force_pin_resets" };

export type RunCompromiseResponseStepInput = {
  actorId: string;
  locationId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
} & CompromiseResponseStepRequest;

export type RunCompromiseResponseStepOutcome =
  | { kind: "no_running_response" }
  | { kind: "out_of_order" }
  | { kind: "already_done" }
  | { kind: "action_refused"; refusal: PasskeyRemovalRefusal }
  | { kind: "done"; doneAt: Date };

async function runAction(
  tx: CompromiseResponseStoreTransaction,
  input: RunCompromiseResponseStepInput,
): Promise<PasskeyRemovalRefusal | null> {
  switch (input.step) {
    case "revoke_every_installation":
      await tx.revokeEveryInstallation(input.actorId, input.at);
      return null;
    case "end_sessions_and_remove_passkeys": {
      const removal = await tx.removeEveryPasskeyOf({
        accountId: input.accountId,
        administratorId: input.actorId,
        locationId: input.locationId,
        passkeyAuthorizedAt: input.passkeyAuthorizedAt,
        at: input.at,
      });
      if (!passkeyRemovalSettlesAccount(removal)) {
        return removal;
      }
      await tx.endEveryBackofficeSession(input.actorId, input.at);
      return null;
    }
    case "force_pin_resets":
      await tx.requirePinResetOfEveryUser(input.actorId, input.at);
      return null;
  }
}

export async function runCompromiseResponseStep(
  { store }: RunCompromiseResponseStepPorts,
  input: RunCompromiseResponseStepInput,
): Promise<RunCompromiseResponseStepOutcome> {
  const step: CompromiseResponseAction = input.step;
  return store.transaction<RunCompromiseResponseStepOutcome>(async (tx) => {
    const latest = await tx.lockLatestResponse();
    if (latest === null || isResponseCompleted(latest.completions)) {
      return { kind: "no_running_response" };
    }
    const refusal = actionStepRefusal(latest.completions, step);
    if (refusal !== null) {
      return { kind: refusal };
    }
    const actionRefusal = await runAction(tx, input);
    if (actionRefusal !== null) {
      return { kind: "action_refused", refusal: actionRefusal };
    }
    await tx.recordStepDone(latest.id, step, input.actorId, input.at);
    return { kind: "done", doneAt: input.at };
  });
}
