import { randomBytes } from "node:crypto";
import {
  type CloudError,
  deviceEnrollmentBodySchema,
  deviceEnrollmentSchema,
  type EnrollmentOutcome,
  retryAfterSecondsOf,
} from "@purosur/contracts";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { installationKeysFrom } from "./installation-keys";

const PEPPER_BYTES = 32;

export interface InstallationReport {
  hostname: string;
  windowsVersion: string;
}

export interface EnrollmentDeps {
  postToCloud: ((path: string, body: unknown) => Promise<CloudResponse>) | undefined;
  installationReport: () => InstallationReport;
  canStoreCredentials: () => Promise<boolean>;
  generatePepper: () => string;
  storeCredentials: (credentials: DeviceCredentials) => Promise<boolean>;
  now: () => Date;
}

export function generatePepper(): string {
  return randomBytes(PEPPER_BYTES).toString("base64url");
}

export function installationReportFrom(os: {
  hostname: () => string;
  version: () => string;
  release: () => string;
}): InstallationReport {
  return { hostname: os.hostname(), windowsVersion: `${os.version()} ${os.release()}` };
}

function refusalOutcome(error: CloudError): EnrollmentOutcome {
  switch (error.code) {
    case "enrollment_code_rejected":
      return { kind: "code_rejected" };
    case "rate_limited":
      return { kind: "rate_limited", retry_after_seconds: retryAfterSecondsOf(error) ?? 0 };
    case "validation_failed":
      return error.details.some((detail) => detail["field"] === "code")
        ? { kind: "code_rejected" }
        : { kind: "unavailable" };
    default:
      return { kind: "unavailable" };
  }
}

export async function enroll(deps: EnrollmentDeps, typedCode: string): Promise<EnrollmentOutcome> {
  const report = deps.installationReport();
  const request = deviceEnrollmentBodySchema.safeParse({
    code: typedCode,
    hostname: report.hostname,
    windows_version: report.windowsVersion,
  });
  if (!request.success) {
    const codeIsWrong = request.error.issues.some((issue) => issue.path[0] === "code");
    return codeIsWrong ? { kind: "invalid_input", fields: ["code"] } : { kind: "unavailable" };
  }
  if (deps.postToCloud === undefined) {
    return { kind: "unavailable" };
  }
  // Redeeming revokes the register's previous installation, so it only happens once this machine
  // is known to be able to keep the token it gets back.
  if (!(await deps.canStoreCredentials())) {
    return { kind: "storage_unavailable" };
  }

  const response = await deps.postToCloud("/api/devices", request.data);
  if (response.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  if (response.kind === "error") {
    return refusalOutcome(response.error);
  }
  const enrollment = deviceEnrollmentSchema.safeParse(response.body);
  if (!enrollment.success) {
    return { kind: "unavailable" };
  }

  const stored = await deps.storeCredentials({
    device_id: enrollment.data.device_id,
    device_token: enrollment.data.device_token,
    pepper: deps.generatePepper(),
    token_received_at: deps.now().toISOString(),
    keys: installationKeysFrom(enrollment.data),
  });
  return stored ? { kind: "enrolled" } : { kind: "not_stored" };
}
