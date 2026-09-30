import { randomBytes } from "node:crypto";
import { INSTALLATION_KEY_BYTES } from "@purosur/domain";

export function generateInstallationKey(): string {
  return randomBytes(INSTALLATION_KEY_BYTES).toString("base64");
}
