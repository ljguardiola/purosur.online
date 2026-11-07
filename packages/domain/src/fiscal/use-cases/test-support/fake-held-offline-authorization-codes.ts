import type { Fortnight } from "../../model/offline-authorization-code.js";
import type { HeldOfflineAuthorizationCodeReader } from "../current-offline-authorization-code-ports.js";
import type { OfflineAuthorizationCode } from "../offline-authorization-code-ports.js";

export class FakeHeldOfflineAuthorizationCodes implements HeldOfflineAuthorizationCodeReader {
  readonly asked: Fortnight[] = [];
  private readonly held: OfflineAuthorizationCode[] = [];

  hold(code: OfflineAuthorizationCode): void {
    this.held.push(code);
  }

  async heldCodeOf(fortnight: Fortnight): Promise<OfflineAuthorizationCode | null> {
    this.asked.push(fortnight);
    return (
      this.held.find(
        (code) => code.fortnight.start === fortnight.start && code.fortnight.end === fortnight.end,
      ) ?? null
    );
  }
}
