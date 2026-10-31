import type { CloudReadOutcome } from "./cloud-read-outcome";
import { rateLimitOutcome } from "./rate-limit-outcome";

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

function refusalOf(response: Response): Exclude<CloudReadOutcome<never>, { kind: "ok" }> {
  if (response.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

export async function readCloudJson<T>(
  path: string,
  schema: Schema<T>,
  request?: { body: unknown },
): Promise<CloudReadOutcome<T>> {
  let response: Response;
  try {
    response =
      request === undefined
        ? await fetch(path)
        : await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.body),
          });
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusalOf(response);
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
