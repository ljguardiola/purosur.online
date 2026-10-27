import { currentZoneRulesSchema } from "@purosur/contracts";
import type { ZoneRules } from "@purosur/domain";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { rateLimitOutcome } from "./rate-limit-outcome";

export async function fetchCurrentZoneRules(): Promise<CloudReadOutcome<ZoneRules>> {
  let response: Response;
  try {
    response = await fetch("/api/zone-rules/current");
  } catch {
    return { kind: "failed" };
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
  const parsed = currentZoneRulesSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return { kind: "failed" };
  }
  return {
    kind: "ok",
    value: {
      version: parsed.data.version,
      transitions: parsed.data.transitions.map(({ from, offset_minutes }) => ({
        from: new Date(from),
        offsetMinutes: offset_minutes,
      })),
    },
  };
}
