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

async function postOnce(
  deps: CloudClientDeps,
  path: string,
  body: unknown,
): Promise<CloudResponse> {
  let response: Response;
  try {
    response = await deps.fetch(new URL(path, deps.cloudUrl).href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { kind: "unreachable" };
  }

  const json = await readJson(response);
  if (response.ok) {
    return { kind: "ok", body: json };
  }
  const envelope = cloudErrorSchema.safeParse(json);
  if (envelope.success) {
    return { kind: "error", error: envelope.data };
  }
  // Only a proxy in front of the cloud answers outside the contract, such as a gateway error.
  return {
    kind: "error",
    error:
      response.status >= 500
        ? cloudError("server_unavailable", `the cloud answered ${response.status}`)
        : cloudError("internal_error", `the cloud answered ${response.status}`),
  };
}

function retryWaitMs(response: CloudResponse, attempt: number): number | undefined {
  if (response.kind === "ok") {
    return undefined;
  }
  if (response.kind === "error" && !isRetryableCloudError(response.error.code)) {
    return undefined;
  }
  const retryAfterSeconds =
    response.kind === "error" ? retryAfterSecondsOf(response.error) : undefined;
  return retryAfterSeconds === undefined ? BACKOFF_MS[attempt - 1] : retryAfterSeconds * 1000;
}

export async function postToCloud(
  deps: CloudClientDeps,
  path: string,
  body: unknown,
): Promise<CloudResponse> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await postOnce(deps, path, body);
    const waitMs = retryWaitMs(response, attempt);
    if (attempt === MAX_ATTEMPTS || waitMs === undefined || waitMs > MAX_WAIT_MS) {
      return response;
    }
    await deps.sleep(waitMs);
  }
}
