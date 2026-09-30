import {
  INSTALLATION_REPORT_MAX_LENGTH,
  isInstallationReportTooLong,
  isWellFormedEnrollmentCode,
  normalizeEnrollmentCode,
} from "@purosur/domain";
import { z } from "zod";
import { installationKeysSchema } from "./installation-keys.js";

const CODE_MESSAGE = "code must be 16 base32 characters";

function installationReportSchema(field: string) {
  const emptyMessage = `${field} must not be empty`;
  return z
    .string({ error: emptyMessage })
    .trim()
    .min(1, emptyMessage)
    .refine(
      (value) => !isInstallationReportTooLong(value),
      `${field} must be at most ${INSTALLATION_REPORT_MAX_LENGTH} characters`,
    );
}

export const deviceEnrollmentBodySchema = z.object({
  code: z
    .string({ error: CODE_MESSAGE })
    .transform(normalizeEnrollmentCode)
    .refine(isWellFormedEnrollmentCode, CODE_MESSAGE),
  hostname: installationReportSchema("hostname"),
  windows_version: installationReportSchema("windows_version"),
});

export type DeviceEnrollmentBody = z.input<typeof deviceEnrollmentBodySchema>;

export const deviceEnrollmentSchema = z.object({
  device_id: z.string(),
  device_token: z.string(),
  ...installationKeysSchema.shape,
});

export type DeviceEnrollment = z.output<typeof deviceEnrollmentSchema>;
