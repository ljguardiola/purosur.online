import {
  type CloudError,
  cloudError,
  cloudErrorSchema,
  isRetryableCloudError,
  retryAfterSecondsOf,
} from "@purosur/contracts";

export interface CloudClientDeps {
  cloudUrl: string;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  sleep: (milliseconds: number) => Promise<void>;
}

export type CloudResponse =
  | { kind: "ok"; body: unknown }
  | { kind: "error"; error: CloudError }
  | { kind: "unreachable" };

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];
// A person is waiting on the screen, so a longer wait is left for them to retry themselves.
const MAX_WAIT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

// Only the cloud's own refusal proves it did nothing, so only that is ever resent: a request that
// timed out, or that a proxy in front of the cloud failed, may already have taken effect.
type Attempt = { response: CloudResponse; refusedByCloud: boolean };

interface PostRequest {
  path: string;
  headers: Record<string, string>;
  body: string | undefined;
}

async function postOnce(deps: CloudClientDeps, request: PostRequest): Promise<Attempt> {
  let response: Response;
  try {
    response = await deps.fetch(new URL(request.path, deps.cloudUrl).href, {
      method: "POST",
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { response: { kind: "unreachable" }, refusedByCloud: false };
  }

  const json = await readJson(response);
  if (response.ok) {
    return { response: { kind: "ok", body: json }, refusedByCloud: false };
  }
  const envelope = cloudErrorSchema.safeParse(json);
  if (envelope.success) {
    return { response: { kind: "error", error: envelope.data }, refusedByCloud: true };
  }
  const error =
    response.status >= 500
      ? cloudError("server_unavailable", `the cloud answered ${response.status}`)
      : cloudError("internal_error", `the cloud answered ${response.status}`);
  return { response: { kind: "error", error }, refusedByCloud: false };
}

function retryWaitMs({ response, refusedByCloud }: Attempt, attempt: number): number | undefined {
  if (!refusedByCloud || response.kind !== "error" || !isRetryableCloudError(response.error.code)) {
    return undefined;
  }
  const retryAfterSeconds = retryAfterSecondsOf(response.error);
  return retryAfterSeconds === undefined ? BACKOFF_MS[attempt - 1] : retryAfterSeconds * 1000;
}

async function post(deps: CloudClientDeps, request: PostRequest): Promise<CloudResponse> {
  for (let attempt = 1; ; attempt += 1) {
    const sent = await postOnce(deps, request);
    const waitMs = retryWaitMs(sent, attempt);
    if (attempt === MAX_ATTEMPTS || waitMs === undefined || waitMs > MAX_WAIT_MS) {
      return sent.response;
    }
    await deps.sleep(waitMs);
  }
}

export function postToCloud(
  deps: CloudClientDeps,
  path: string,
  body: unknown,
): Promise<CloudResponse> {
  return post(deps, {
    path,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function postToCloudWithBearer(
  deps: CloudClientDeps,
  path: string,
  bearerToken: string,
): Promise<CloudResponse> {
  return post(deps, { path, headers: { authorization: `Bearer ${bearerToken}` }, body: undefined });
}
