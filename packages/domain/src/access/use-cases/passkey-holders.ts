export type PasskeyHolderScope = "active" | "inactive" | "any";

export interface PasskeyHolders {
  // The person of the branch whose passkeys are listed or removed.
  passkeyHolder(
    locationId: string,
    userId: string,
    activeScope: PasskeyHolderScope,
  ): Promise<{ id: string } | undefined>;
}
