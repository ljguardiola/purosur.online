import { codePointLength } from "../../shared/index.js";

export const INSTALLATION_REPORT_MAX_LENGTH = 255;

export function isInstallationReportTooLong(value: string): boolean {
  return codePointLength(value) > INSTALLATION_REPORT_MAX_LENGTH;
}
