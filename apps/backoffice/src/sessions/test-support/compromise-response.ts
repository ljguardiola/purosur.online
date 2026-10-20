import type { CompromiseResponseBody } from "@purosur/contracts";
import type { BranchUser } from "../../platform/branch-users-api";
import type { CompromiseResponse } from "../compromise-response-api";

type Step = CompromiseResponse["steps"][number]["step"];
type Item = CompromiseResponse["items"][number]["item"];

const STEPS: Step[] = [
  "revoke_every_installation",
  "end_sessions_and_remove_passkeys",
  "force_pin_resets",
  "rotate_external_secrets",
  "notify",
  "re_enroll_registers",
];

const ITEMS: Item[] = [
  "mercado_pago_webhook_secret",
  "whatsapp_webhook_token",
  "whatsapp_webhook_secret",
  "claude_api_key",
  "postgres_credentials",
  "ci_deployment_credentials",
  "storage_bucket_credentials",
  "arca_certificate_and_private_key",
  "notify",
];

const ITEM_STEPS: Record<Item, Step> = {
  mercado_pago_webhook_secret: "rotate_external_secrets",
  whatsapp_webhook_token: "rotate_external_secrets",
  whatsapp_webhook_secret: "rotate_external_secrets",
  claude_api_key: "rotate_external_secrets",
  postgres_credentials: "rotate_external_secrets",
  ci_deployment_credentials: "rotate_external_secrets",
  storage_bucket_credentials: "rotate_external_secrets",
  arca_certificate_and_private_key: "rotate_external_secrets",
  notify: "notify",
};

const DONE_AT = "2026-10-01T15:30:00.000Z";

export const ACCOUNT_ID = "6f1d2b3c-4a5e-4f60-8a71-92b3c4d5e6f7";

export function account(
  user: Pick<BranchUser, "id" | "firstName" | "email"> & Partial<BranchUser>,
): BranchUser {
  return {
    version: 1,
    role: { id: "role-cashier", isAdministrator: false, name: "Cajero" },
    passkeyCount: 1,
    isLastActiveAdministrator: false,
    mayEmitPinCode: true,
    mayEdit: true,
    mayDeactivate: true,
    mayReactivate: false,
    mayRemovePasskey: true,
    ...user,
  };
}

export function runbookBody(
  doneSteps: readonly Step[] = [],
  doneItems: readonly Item[] = [],
  completed = false,
): CompromiseResponseBody {
  const isDone = (step: Step) =>
    doneSteps.includes(step) ||
    (step === "rotate_external_secrets" &&
      ITEMS.filter((item) => ITEM_STEPS[item] === step).every((item) =>
        doneItems.includes(item),
      )) ||
    (step === "notify" && doneItems.includes("notify"));
  return {
    id: "d3b07384-d9a1-4c3e-9f1a-0b1c2d3e4f50",
    started_at: "2026-10-01T14:00:00.000Z",
    started_by: "6f1d2b3c-4a5e-4f60-8a71-92b3c4d5e6f0",
    completed,
    steps: STEPS.map((step, index) => ({
      step,
      done: isDone(step),
      done_at: isDone(step) ? DONE_AT : null,
      available: !isDone(step) && STEPS.slice(0, index).every(isDone),
    })),
    items: ITEMS.map((item) => ({
      item,
      step: ITEM_STEPS[item],
      done: doneItems.includes(item),
      done_at: doneItems.includes(item) ? DONE_AT : null,
    })),
  };
}

export function runbook(
  doneSteps: readonly Step[] = [],
  doneItems: readonly Item[] = [],
  completed = false,
): CompromiseResponse {
  const body = runbookBody(doneSteps, doneItems, completed);
  return {
    id: body.id,
    startedAt: body.started_at,
    startedBy: body.started_by,
    completed: body.completed,
    steps: body.steps.map((step) => ({
      step: step.step,
      done: step.done,
      doneAt: step.done_at,
      available: step.available,
    })),
    items: body.items.map((item) => ({
      item: item.item,
      step: item.step,
      done: item.done,
      doneAt: item.done_at,
    })),
  };
}
