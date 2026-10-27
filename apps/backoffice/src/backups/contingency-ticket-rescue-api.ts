import {
  type ContingencyBackupTicketRescueRequest,
  type ContingencyBackupTicketRescueResponse,
  contingencyBackupTicketRescueResponseSchema,
} from "@purosur/contracts";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";

export type RescueContingencyBackupTicketOutcome =
  CloudReadOutcome<ContingencyBackupTicketRescueResponse>;

export async function rescueContingencyBackupTicket(
  qrCodes: string[],
): Promise<RescueContingencyBackupTicketOutcome> {
  const request: ContingencyBackupTicketRescueRequest = { qr_codes: qrCodes };
  let response: Response;
  try {
    response = await fetch("/api/contingency-backup-tickets/rescue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
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
  const parsed = contingencyBackupTicketRescueResponseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "failed" };
}
