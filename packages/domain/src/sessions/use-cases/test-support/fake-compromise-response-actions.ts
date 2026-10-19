import type { PasskeyRemovalResult } from "../../model/compromise-response.js";
import type { CompromiseResponseActions } from "../compromise-response-actions.js";

export class FakeCompromiseResponseActions implements CompromiseResponseActions {
  readonly calls: string[] = [];

  installationRevocation: "nothing_to_revoke" | "revoked" = "revoked";
  passkeyRemoval: PasskeyRemovalResult = "removed";
  usersWithPinReset = 3;

  async revokeEveryInstallation(): Promise<{ kind: "nothing_to_revoke" | "revoked" }> {
    this.calls.push("revokeEveryInstallation");
    return { kind: this.installationRevocation };
  }

  async removeAccountPasskeys(accountId: string): Promise<{ kind: PasskeyRemovalResult }> {
    this.calls.push(`removeAccountPasskeys:${accountId}`);
    return { kind: this.passkeyRemoval };
  }

  async endEveryBackofficeSession(): Promise<{ kind: "ended" }> {
    this.calls.push("endEveryBackofficeSession");
    return { kind: "ended" };
  }

  async requirePinResetOfEveryUser(): Promise<{ kind: "required"; users: number }> {
    this.calls.push("requirePinResetOfEveryUser");
    return { kind: "required", users: this.usersWithPinReset };
  }
}
