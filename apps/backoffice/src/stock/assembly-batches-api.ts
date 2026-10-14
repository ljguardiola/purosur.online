import {
  type AssemblyBatchBody,
  type AssemblyBatchList,
  type AssemblyBatchPreview,
  type AssemblyBatchRefusal,
  type AssemblyBatchResult,
  assemblyBatchListSchema,
  assemblyBatchPreviewSchema,
  assemblyBatchRefusalSchema,
  assemblyBatchResultSchema,
  type StockPeriodDays,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

type RequestRefusal =
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RegisterAssemblyBatchOutcome =
  | { kind: "ok"; batch: AssemblyBatchResult["batch"] }
  | { kind: "validation_failed"; field: string }
  | { kind: "product_not_found" }
  | { kind: "no_recipe" }
  | { kind: "stale_recipe" }
  | { kind: "nothing_used" }
  | { kind: "invalid_output" }
  | { kind: "invalid_quantity"; componentProductId: string }
  | RequestRefusal;

function refusal(response: Response): RequestRefusal {
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

async function read<T>(
  path: string,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): Promise<CloudReadOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    return { kind: "failed" };
  }
  if (!response.ok) {
    return refusal(response);
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export function fetchAssemblyBatches(
  days: StockPeriodDays,
): Promise<CloudReadOutcome<AssemblyBatchList>> {
  return read(`/api/assembly-batches?days=${days}`, assemblyBatchListSchema);
}

export type AssemblyBatchPreviewRequest = {
  productId: string;
  size: number;
  used?: AssemblyBatchBody["used"];
  output?: number;
};

export function fetchAssemblyBatchPreview({
  productId,
  size,
  used,
  output,
}: AssemblyBatchPreviewRequest): Promise<CloudReadOutcome<AssemblyBatchPreview>> {
  const query = new URLSearchParams({ productId, size: String(size) });
  for (const { componentProductId, quantity } of used ?? []) {
    query.append("used", `${componentProductId}:${quantity}`);
  }
  if (output !== undefined) {
    query.set("output", String(output));
  }
  return read(`/api/assembly-batches/preview?${query.toString()}`, assemblyBatchPreviewSchema);
}

function outcomeOf(refused: AssemblyBatchRefusal): RegisterAssemblyBatchOutcome {
  switch (refused.code) {
    case "invalid_quantity":
      return { kind: "invalid_quantity", componentProductId: refused.componentProductId };
    case "invalid_size":
      return { kind: "failed" };
    default:
      return { kind: refused.code };
  }
}

export async function registerAssemblyBatch(
  body: AssemblyBatchBody,
): Promise<RegisterAssemblyBatchOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/assembly-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = assemblyBatchResultSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok", batch: parsed.data.batch } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response.clone());
    if (field !== undefined) {
      return { kind: "validation_failed", field };
    }
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    const refused = assemblyBatchRefusalSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return refused.success ? outcomeOf(refused.data) : { kind: "failed" };
  }
  return refusal(response);
}
