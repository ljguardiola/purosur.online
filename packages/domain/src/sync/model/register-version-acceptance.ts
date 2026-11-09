import { isRegisterVersionAtLeast } from "../../register/index.js";
import { MINIMUM_ACCEPTED_REGISTER_VERSION } from "./register-version.js";

export function registerVersionAccepted(appVersion: string): boolean {
  return isRegisterVersionAtLeast(appVersion, MINIMUM_ACCEPTED_REGISTER_VERSION);
}

export function isLeftBehindByMinimum(reportedVersion: string | null, minimum: string): boolean {
  return reportedVersion === null || !isRegisterVersionAtLeast(reportedVersion, minimum);
}
