import { healthCheckSchema } from "@purosur/contracts";
import { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "@purosur/domain";
import type { RegisterHealthCheck } from "@purosur/domain/fiscal/use-cases";
import type { CloudCallOptions, CloudResponse } from "../platform/cloud-client";

export interface CheckRegisterHealthDeps {
  readDeviceToken: () => Promise<string | undefined>;
  get: (
    path: string,
    headers: Record<string, string>,
    options: CloudCallOptions,
  ) => Promise<CloudResponse>;
  record: (check: RegisterHealthCheck) => Promise<unknown>;
  now: () => Date;
}

export async function checkRegisterHealth({
  readDeviceToken,
  get,
  record,
  now,
}: CheckRegisterHealthDeps): Promise<"recorded" | "skipped"> {
  const deviceToken = await readDeviceToken();
  if (deviceToken === undefined) {
    return "skipped";
  }
  const askedAt = now();
  const response = await get(
    "/api/health",
    { authorization: `Bearer ${deviceToken}` },
    { timeoutMs: REGISTER_HEALTH_CHECK_INTERVAL_MS, singleAttempt: true },
  );
  const answeredAt = now();
  if (response.kind !== "ok") {
    return "skipped";
  }
  const health = healthCheckSchema.safeParse(response.body);
  if (!health.success || health.data.arca === undefined) {
    return "skipped";
  }
  await record({
    checkedAt: answeredAt,
    roundTripMs: answeredAt.getTime() - askedAt.getTime(),
    tokenValid: health.data.arca.token_valid,
    arcaReachable: health.data.arca.reachable,
  });
  return "recorded";
}
