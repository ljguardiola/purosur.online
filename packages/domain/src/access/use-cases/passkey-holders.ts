export type PasskeyHolderScope = "active" | "inactive" | "any";

export interface PasskeyHolders {
  passkeyHolder(
    locationId: string,
    userId: string,
    activeScope: PasskeyHolderScope,
  ): Promise<{ id: string } | undefined>;
}
