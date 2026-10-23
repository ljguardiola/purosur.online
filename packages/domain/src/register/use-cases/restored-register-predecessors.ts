export type PredecessorStanding = "not_of_register" | "not_revoked" | "revoked";

export interface RestoredRegisterPredecessors {
  predecessorStanding(
    registerId: string,
    predecessorDeviceId: string,
  ): Promise<PredecessorStanding>;
  // The predecessor, or an installation of the register enrolled after it.
  isReplenishmentCursor(
    registerId: string,
    predecessorDeviceId: string,
    cursorDeviceId: string,
  ): Promise<boolean>;
  // The earliest enrolled installation of the register, other than the one asking, that was revoked.
  firstRevokedInstallation(
    registerId: string,
    currentDeviceId: string,
  ): Promise<string | undefined>;
}
