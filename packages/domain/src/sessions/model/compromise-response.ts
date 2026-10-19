export const COMPROMISE_RESPONSE_STEPS = [
  "revoke_every_installation",
  "end_sessions_and_remove_passkeys",
  "force_pin_resets",
  "rotate_external_secrets",
  "notify",
  "re_enroll_registers",
] as const;

export type CompromiseResponseStep = (typeof COMPROMISE_RESPONSE_STEPS)[number];

export const COMPROMISE_RESPONSE_ACTION_STEPS = [
  "revoke_every_installation",
  "end_sessions_and_remove_passkeys",
  "force_pin_resets",
] as const;

export type CompromiseResponseAction = (typeof COMPROMISE_RESPONSE_ACTION_STEPS)[number];

export const EXTERNAL_SECRET_ITEMS = [
  "mercado_pago_webhook_secret",
  "whatsapp_webhook_token",
  "whatsapp_webhook_secret",
  "claude_api_key",
  "postgres_credentials",
  "ci_deployment_credentials",
  "storage_bucket_credentials",
  "arca_certificate_and_private_key",
] as const;

export type ExternalSecretItem = (typeof EXTERNAL_SECRET_ITEMS)[number];

export const NOTIFY_ITEM = "notify";

export const COMPROMISE_RESPONSE_ITEMS = [...EXTERNAL_SECRET_ITEMS, NOTIFY_ITEM] as const;

export type CompromiseResponseItem = (typeof COMPROMISE_RESPONSE_ITEMS)[number];

export interface CompromiseResponseCompletion {
  key: CompromiseResponseAction | CompromiseResponseItem;
  at: Date;
}

export type CompromiseResponseRefusal = "already_done" | "out_of_order";

export interface CompromiseResponseStepState {
  step: CompromiseResponseStep;
  done: boolean;
  doneAt: Date | null;
  available: boolean;
}

export interface CompromiseResponseItemState {
  item: CompromiseResponseItem;
  step: CompromiseResponseStep;
  done: boolean;
  doneAt: Date | null;
}

export type PasskeyRemovalResult =
  | "authorization_required"
  | "user_not_found"
  | "own_account"
  | "no_passkeys"
  | "removed";

export function stepOfItem(item: CompromiseResponseItem): CompromiseResponseStep {
  return item === NOTIFY_ITEM ? "notify" : "rotate_external_secrets";
}

function completionAt(
  completions: readonly CompromiseResponseCompletion[],
  key: CompromiseResponseCompletion["key"],
): Date | null {
  return completions.find((completion) => completion.key === key)?.at ?? null;
}

function stepDoneAt(
  completions: readonly CompromiseResponseCompletion[],
  step: CompromiseResponseStep,
): Date | null {
  switch (step) {
    case "rotate_external_secrets": {
      let latest: Date | null = null;
      for (const item of EXTERNAL_SECRET_ITEMS) {
        const at = completionAt(completions, item);
        if (at === null) {
          return null;
        }
        if (latest === null || at.getTime() > latest.getTime()) {
          latest = at;
        }
      }
      return latest;
    }
    case "notify":
      return completionAt(completions, NOTIFY_ITEM);
    case "re_enroll_registers":
      return null;
    default:
      return completionAt(completions, step);
  }
}

function everyStepBeforeIsDone(
  completions: readonly CompromiseResponseCompletion[],
  step: CompromiseResponseStep,
): boolean {
  return COMPROMISE_RESPONSE_STEPS.slice(0, COMPROMISE_RESPONSE_STEPS.indexOf(step)).every(
    (earlier) => stepDoneAt(completions, earlier) !== null,
  );
}

export function actionStepRefusal(
  completions: readonly CompromiseResponseCompletion[],
  step: CompromiseResponseAction,
): CompromiseResponseRefusal | null {
  if (completionAt(completions, step) !== null) {
    return "already_done";
  }
  return everyStepBeforeIsDone(completions, step) ? null : "out_of_order";
}

export function itemRefusal(
  completions: readonly CompromiseResponseCompletion[],
  item: CompromiseResponseItem,
): CompromiseResponseRefusal | null {
  if (completionAt(completions, item) !== null) {
    return "already_done";
  }
  return everyStepBeforeIsDone(completions, stepOfItem(item)) ? null : "out_of_order";
}

export function isResponseCompleted(completions: readonly CompromiseResponseCompletion[]): boolean {
  return stepDoneAt(completions, "notify") !== null;
}

export function stepStates(
  completions: readonly CompromiseResponseCompletion[],
): CompromiseResponseStepState[] {
  return COMPROMISE_RESPONSE_STEPS.map((step) => {
    const doneAt = stepDoneAt(completions, step);
    return {
      step,
      done: doneAt !== null,
      doneAt,
      available: doneAt === null && everyStepBeforeIsDone(completions, step),
    };
  });
}

export function itemStates(
  completions: readonly CompromiseResponseCompletion[],
): CompromiseResponseItemState[] {
  return COMPROMISE_RESPONSE_ITEMS.map((item) => {
    const doneAt = completionAt(completions, item);
    return { item, step: stepOfItem(item), done: doneAt !== null, doneAt };
  });
}

export type PasskeyRemovalRefusal = Exclude<PasskeyRemovalResult, "no_passkeys" | "removed">;

export function passkeyRemovalSettlesAccount(
  result: PasskeyRemovalResult,
): result is Exclude<PasskeyRemovalResult, PasskeyRemovalRefusal> {
  return result === "removed" || result === "no_passkeys";
}
