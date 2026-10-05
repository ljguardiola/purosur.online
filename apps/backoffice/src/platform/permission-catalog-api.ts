import { type PermissionCatalogWire, permissionCatalogSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "./cloud-read-outcome";
import { rateLimitOutcome } from "./rate-limit-outcome";

export async function fetchPermissionCatalog(): Promise<CloudReadOutcome<PermissionCatalogWire>> {
  let response: Response;
  try {
    response = await fetch("/api/permission-catalog");
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
  const parsed = permissionCatalogSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
