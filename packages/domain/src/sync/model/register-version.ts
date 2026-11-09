import { isRegisterVersionAtLeast } from "../../register/index.js";

export const MINIMUM_ACCEPTED_REGISTER_VERSION = "0.0.0";

export function registerVersionAccepted(appVersion: string): boolean {
  return isRegisterVersionAtLeast(appVersion, MINIMUM_ACCEPTED_REGISTER_VERSION);
}

export function isLeftBehindByMinimum(reportedVersion: string | null, minimum: string): boolean {
  return reportedVersion === null || !isRegisterVersionAtLeast(reportedVersion, minimum);
}
