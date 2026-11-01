import { type ExceptionShareYearBody, exceptionShareYearSchema } from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type FetchExceptionShareYearOutcome =
  | CloudReadOutcome<ExceptionShareYearBody>
  | { kind: "not_found" };

export async function fetchExceptionShareYear({
  fiscalAddressId,
  year,
}: {
  fiscalAddressId: string;
  year?: number | undefined;
}): Promise<FetchExceptionShareYearOutcome> {
  let response: Response;
  try {
    response = await fetch(
      `/api/fiscal/exception-share/${encodeURIComponent(fiscalAddressId)}${year === undefined ? "" : `?year=${year}`}`,
    );
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
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
  const parsed = exceptionShareYearSchema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
