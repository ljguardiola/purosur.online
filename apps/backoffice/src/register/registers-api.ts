import {
  type BitlockerRecoveryKeyLoadBody,
  bitlockerRecoveryKeySchema,
  everyInstallationRevocationSchema,
  type PointTerminalAssignmentBody,
  pointTerminalAssignmentSchema,
  type QrPointOfSaleAssignmentBody,
  qrPointOfSaleAssignmentSchema,
  type RegisterCreationBody,
  type RegisterSummaryBody,
  registerCoverageSchema,
  registerEnrollmentCodeSchema,
  registerListSchema,
  registerRevocationSchema,
  registerSyncStatusListSchema,
} from "@purosur/contracts";
import type { PermissionKey } from "@purosur/domain";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { rateLimitOutcome } from "../platform/rate-limit-outcome";
import { readValidationFailedField } from "../platform/validation-failed-field";

type PendingEnrollmentCode = { secondsSinceIssued: number; secondsUntilExpiry: number };

export type RegisterInstallation =
  | {
      state: "enrolled";
      hostname: string;
      windowsVersion: string;
      enrolledAt: string;
      bitlockerKeyLoaded: boolean;
    }
  | {
      state: "revoked";
      hostname: string;
      windowsVersion: string;
      enrolledAt: string;
      revokedAt: string;
    };

export type RegisterSummary = {
  id: string;
  name: string;
  pendingCode: PendingEnrollmentCode | null;
  pointOfSaleNumber: number | null;
  pointTerminalId: string | null;
  pointTerminalVersion: number;
  qrExternalPosId: string | null;
  qrPointOfSaleVersion: number;
  installation: RegisterInstallation | null;
};

export type FetchRegistersOutcome = CloudReadOutcome<RegisterSummary[]>;

export type RegisterSyncStatus = {
  id: string;
  name: string;
  lastSuccessfulSyncAt: string | null;
};

export type FetchRegisterSyncStatusOutcome = CloudReadOutcome<RegisterSyncStatus[]>;

export type FetchRegisterCoverageOutcome = CloudReadOutcome<PermissionKey[]>;

export type CreateRegisterInput = RegisterCreationBody;

export type CreateRegisterOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "name_taken" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type AssignPointTerminalOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "point_terminal_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type AssignQrPointOfSaleOutcome =
  | { kind: "ok" }
  | { kind: "validation_failed"; field: string }
  | { kind: "qr_point_of_sale_taken" }
  | { kind: "stale_version" }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

type EmittedEnrollmentCode = { code: string; expiresAt: string };

export type EmitEnrollmentCodeOutcome =
  | { kind: "ok"; value: EmittedEnrollmentCode }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type RevokeRegisterOutcome =
  | { kind: "ok"; value: { revokedAt: string } }
  | { kind: "not_found" }
  | { kind: "no_active_installation" }
  | { kind: "forbidden" }
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

export type LoadBitlockerRecoveryKeyOutcome =
  | { kind: "ok" }
  | { kind: "not_found" }
  | { kind: "no_current_installation" }
  | { kind: "already_loaded" }
  | GatedActionErrorOutcome;

export type ConsultBitlockerRecoveryKeyOutcome =
  | { kind: "ok"; value: { recoveryKey: string; keyIdentifier: string } }
  | { kind: "not_found" }
  | { kind: "no_current_installation" }
  | { kind: "not_loaded" }
  | GatedActionErrorOutcome;

export type RevokeEveryInstallationOutcome =
  | { kind: "ok"; value: { revokedAt: string; revokedRegisters: number } }
  | { kind: "no_active_installation" }
  | GatedActionErrorOutcome;

function postJson(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function installationFromWire(
  installation: RegisterSummaryBody["installation"],
): RegisterInstallation | null {
  if (installation === null) {
    return null;
  }
  const common = {
    hostname: installation.hostname,
    windowsVersion: installation.windows_version,
    enrolledAt: installation.enrolled_at,
  };
  return installation.state === "enrolled"
    ? { state: "enrolled", ...common, bitlockerKeyLoaded: installation.bitlocker_key_loaded }
    : { state: "revoked", ...common, revokedAt: installation.revoked_at };
}

function registerFromWire(row: RegisterSummaryBody): RegisterSummary {
  return {
    id: row.id,
    name: row.name,
    pendingCode: row.pending_code
      ? {
          secondsSinceIssued: row.pending_code.seconds_since_issued,
          secondsUntilExpiry: row.pending_code.seconds_until_expiry,
        }
      : null,
    pointOfSaleNumber: row.point_of_sale_number,
    pointTerminalId: row.point_terminal_id,
    pointTerminalVersion: row.point_terminal_version,
    qrExternalPosId: row.qr_external_pos_id,
    qrPointOfSaleVersion: row.qr_point_of_sale_version,
    installation: installationFromWire(row.installation),
  };
}

// Creating a register, emitting its code and revoking it are gated by the shared passkey-authorization window: a 401 here means
// either the session ended or that window has lapsed, never a rejected assertion.
type GatedActionErrorOutcome =
  | { kind: "unauthenticated" }
  | { kind: "authorization_required" }
  | { kind: "forbidden" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "failed" };

async function gatedActionErrorOutcome(response: Response): Promise<GatedActionErrorOutcome> {
  if (response.status === 401) {
    const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
    return body?.code === "authorization_required"
      ? { kind: "authorization_required" }
      : { kind: "unauthenticated" };
  }
  if (response.status === 403) {
    return { kind: "forbidden" };
  }
  if (response.status === 429) {
    return rateLimitOutcome(response);
  }
  return { kind: "failed" };
}

async function readCloud<T>(
  path: string,
  fromBody: (body: unknown) => T | undefined,
): Promise<CloudReadOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(path);
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
  const value = fromBody(await response.json().catch(() => undefined));
  return value === undefined ? { kind: "failed" } : { kind: "ok", value };
}

export function fetchRegisters(): Promise<FetchRegistersOutcome> {
  return readCloud("/api/registers", (body) =>
    registerListSchema.safeParse(body).data?.map(registerFromWire),
  );
}

export function fetchRegisterCoverage(): Promise<FetchRegisterCoverageOutcome> {
  return readCloud(
    "/api/registers/coverage",
    (body) => registerCoverageSchema.safeParse(body).data?.uncovered_permissions,
  );
}

export function fetchRegisterSyncStatus(): Promise<FetchRegisterSyncStatusOutcome> {
  return readCloud("/api/registers/sync-status", (body) =>
    registerSyncStatusListSchema.safeParse(body).data?.map((row) => ({
      id: row.id,
      name: row.name,
      lastSuccessfulSyncAt: row.last_successful_sync_at,
    })),
  );
}

export async function createRegister(input: CreateRegisterInput): Promise<CreateRegisterOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/registers", input);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 409) {
    return { kind: "name_taken" };
  }
  return gatedActionErrorOutcome(response);
}

export async function emitEnrollmentCode(id: string): Promise<EmitEnrollmentCodeOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/device-codes`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = registerEnrollmentCodeSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) {
      return { kind: "failed" };
    }
    return { kind: "ok", value: { code: parsed.data.code, expiresAt: parsed.data.expires_at } };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  return gatedActionErrorOutcome(response);
}

export async function revokeRegister(id: string): Promise<RevokeRegisterOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/revocations`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = registerRevocationSchema.safeParse(await response.json().catch(() => undefined));
    return parsed.success
      ? { kind: "ok", value: { revokedAt: parsed.data.revoked_at } }
      : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: string } | undefined)
      ?.code;
    return code === "no_active_installation" ? { kind: code } : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}

async function conflictCode(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { code?: string } | undefined;
  return body?.code;
}

export async function loadBitlockerRecoveryKey(
  id: string,
  body: BitlockerRecoveryKeyLoadBody,
): Promise<LoadBitlockerRecoveryKeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/bitlocker-recovery-key`, body);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    return { kind: "ok" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await conflictCode(response);
    return code === "no_current_installation" || code === "already_loaded"
      ? { kind: code }
      : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}

export async function consultBitlockerRecoveryKey(
  id: string,
): Promise<ConsultBitlockerRecoveryKeyOutcome> {
  let response: Response;
  try {
    response = await postJson(`/api/registers/${id}/bitlocker-recovery-key/consultations`);
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = bitlockerRecoveryKeySchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? {
          kind: "ok",
          value: {
            recoveryKey: parsed.data.recovery_key,
            keyIdentifier: parsed.data.key_identifier,
          },
        }
      : { kind: "failed" };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = await conflictCode(response);
    return code === "no_current_installation" || code === "not_loaded"
      ? { kind: code }
      : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}

export async function revokeEveryInstallation(): Promise<RevokeEveryInstallationOutcome> {
  let response: Response;
  try {
    response = await postJson("/api/registers/revocations");
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = everyInstallationRevocationSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success
      ? {
          kind: "ok",
          value: {
            revokedAt: parsed.data.revoked_at,
            revokedRegisters: parsed.data.revoked_registers,
          },
        }
      : { kind: "failed" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: string } | undefined)
      ?.code;
    return code === "no_active_installation" ? { kind: code } : { kind: "failed" };
  }
  return gatedActionErrorOutcome(response);
}

export async function assignPointTerminal(
  registerId: string,
  body: PointTerminalAssignmentBody,
): Promise<AssignPointTerminalOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/registers/${registerId}/point-terminal`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = pointTerminalAssignmentSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: string } | undefined)
      ?.code;
    return code === "point_terminal_taken" || code === "stale_version"
      ? { kind: code }
      : { kind: "failed" };
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
  return { kind: "failed" };
}

export async function assignQrPointOfSale(
  registerId: string,
  body: QrPointOfSaleAssignmentBody,
): Promise<AssignQrPointOfSaleOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/registers/${registerId}/qr-point-of-sale`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.ok) {
    const parsed = qrPointOfSaleAssignmentSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    return parsed.success ? { kind: "ok" } : { kind: "failed" };
  }
  if (response.status === 400) {
    const field = await readValidationFailedField(response);
    return field === undefined ? { kind: "failed" } : { kind: "validation_failed", field };
  }
  if (response.status === 404) {
    return { kind: "not_found" };
  }
  if (response.status === 409) {
    const code = ((await response.json().catch(() => undefined)) as { code?: string } | undefined)
      ?.code;
    return code === "qr_point_of_sale_taken" || code === "stale_version"
      ? { kind: code }
      : { kind: "failed" };
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
  return { kind: "failed" };
}
