import {
  type CompromiseResponseBody,
  type CompromiseResponseSessionsAndPasskeysBody,
  compromiseResponseSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type CompromiseResponseStep = CompromiseResponseBody["steps"][number]["step"];
export type CompromiseResponseItem = CompromiseResponseBody["items"][number]["item"];

export type CompromiseResponse = {
  id: string;
  startedAt: string;
  startedBy: string;
  completed: boolean;
  steps: {
    step: CompromiseResponseStep;
    done: boolean;
    doneAt: string | null;
    available: boolean;
  }[];
  items: {
    item: CompromiseResponseItem;
    step: CompromiseResponseStep;
    done: boolean;
    doneAt: string | null;
  }[];
};

export type RunbookRefusal = "no_running_response" | "out_of_order" | "already_done";

type CommonFailure =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type FetchCompromiseResponseOutcome = CloudReadOutcome<CompromiseResponse | null>;

export type StartCompromiseResponseOutcome = { kind: "ok"; value: CompromiseResponse } | CommonFailure;

export type StepOutcome =
  | { kind: "ok"; value: CompromiseResponse }
  | { kind: RunbookRefusal }
  | { kind: "authorization_required" }
  | CommonFailure;

export type EndSessionsAndRemovePasskeysOutcome =
  | StepOutcome
  | { kind: "not_found" }
  | { kind: "own_account" };

export type MarkItemDoneOutcome = Exclude<StepOutcome, { kind: "authorization_required" }>;

const REFUSALS: readonly RunbookRefusal[] = ["no_running_response", "out_of_order", "already_done"];

function refusalOf(code: string | undefined): RunbookRefusal | undefined {
  return REFUSALS.find((refusal) => refusal === code);
}

function runbookFromWire(body: CompromiseResponseBody): CompromiseResponse {
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

function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function codeOf(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code;
}

async function readRunbook(response: Response): Promise<CompromiseResponse | undefined> {
  const parsed = compromiseResponseSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? runbookFromWire(parsed.data) : undefined;
}

async function stepFailure(response: Response): Promise<Exclude<StepOutcome, { kind: "ok" }>> {
  if (response.status === 401) {
    return (await codeOf(response)) === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (response.status === 409) {
    const refusal = refusalOf(await codeOf(response));
    if (refusal) {
      return { kind: refusal };
    }
  }
  return { kind: "failed" };
}

async function runStep(path: string, body?: unknown): Promise<StepOutcome> {
  let response: Response;
  try {
    response = await post(path, body);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return stepFailure(response);
  }
  const value = await readRunbook(response);
  return value ? { kind: "ok", value } : { kind: "failed" };
}

export async function fetchCompromiseResponse(): Promise<FetchCompromiseResponseOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/compromise-responses/current");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "ok", value: null };
  }
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  if (!response.ok) {
    return { kind: "failed" };
  }
  const value = await readRunbook(response);
  return value ? { kind: "ok", value } : { kind: "failed" };
}

export async function startCompromiseResponse(): Promise<StartCompromiseResponseOutcome> {
  const outcome = await runStep("/api/compromise-responses");
  if (outcome.kind === "ok" || outcome.kind === "unauthenticated" || outcome.kind === "forbidden") {
    return outcome;
  }
  return outcome.kind === "rate_limited" ? outcome : { kind: "failed" };
}

export function revokeEveryInstallation(): Promise<StepOutcome> {
  return runStep("/api/compromise-responses/current/steps/revoke-every-installation");
}

export function forcePinResets(): Promise<StepOutcome> {
  return runStep("/api/compromise-responses/current/steps/force-pin-resets");
}

export async function endSessionsAndRemovePasskeys(
  body: CompromiseResponseSessionsAndPasskeysBody,
): Promise<EndSessionsAndRemovePasskeysOutcome> {
  let response: Response;
  try {
    response = await post(
      "/api/compromise-responses/current/steps/end-sessions-and-remove-passkeys",
      body,
    );
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const value = await readRunbook(response);
    return value ? { kind: "ok", value } : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 403 && (await codeOf(response.clone())) === "own_account") {
    return { kind: "own_account" };
  }
  return stepFailure(response);
}

export async function markItemDone(item: CompromiseResponseItem): Promise<MarkItemDoneOutcome> {
  const outcome = await runStep(`/api/compromise-responses/current/items/${item}`);
  return outcome.kind === "authorization_required" ? { kind: "failed" } : outcome;
}
