import type { PasskeyRemovalResult } from "../model/compromise-response.js";

export interface CompromiseResponseActions {
  revokeEveryInstallation(): Promise<{ kind: "nothing_to_revoke" | "revoked" }>;
  removeAccountPasskeys(accountId: string): Promise<{ kind: PasskeyRemovalResult }>;
  endEveryBackofficeSession(): Promise<{ kind: "ended" }>;
  requirePinResetOfEveryUser(): Promise<{ kind: "required"; users: number }>;
}
