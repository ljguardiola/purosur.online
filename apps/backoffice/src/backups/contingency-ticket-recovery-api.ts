import {
  type ContingencyTicketRecoveriesResponse,
  type ContingencyTicketRecoveryFinishResponse,
  contingencyTicketRecoveriesResponseSchema,
  contingencyTicketRecoveryFinishResponseSchema,
} from "@purosur/contracts";
import type { z } from "zod";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type ContingencyTicketRecovery = ContingencyTicketRecoveriesResponse["recoveries"][number];

export type FetchContingencyTicketRecoveriesOutcome =
  CloudReadOutcome<ContingencyTicketRecoveriesResponse>;

export type FinishContingencyTicketRecoveryOutcome =
  CloudReadOutcome<ContingencyTicketRecoveryFinishResponse>;

async function readOutcome<T>(
  send: () => Promise<Response>,
  schema: z.ZodType<T>,
): Promise<CloudReadOutcome<T>> {
  let response: Response;
  try {
    response = await send();
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
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}

export function fetchContingencyTicketRecoveries(): Promise<FetchContingencyTicketRecoveriesOutcome> {
  return readOutcome(
    () => fetch("/api/contingency-backup-tickets/recoveries"),
    contingencyTicketRecoveriesResponseSchema,
  );
}

export function finishContingencyTicketRecovery(
  recoveryId: string,
): Promise<FinishContingencyTicketRecoveryOutcome> {
  return readOutcome(
    () =>
      fetch(`/api/contingency-backup-tickets/recoveries/${recoveryId}/finish`, {
        method: "POST",
      }),
    contingencyTicketRecoveryFinishResponseSchema,
  );
}
