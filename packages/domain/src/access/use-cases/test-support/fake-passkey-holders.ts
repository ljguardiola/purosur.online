import type { PasskeyHolders, PasskeyHolderScope } from "../passkey-holders.js";

export interface FakePasskeyHolder {
  id: string;
  locationId: string;
  active: boolean;
}

export class FakePasskeyHolders implements PasskeyHolders {
  private readonly seeded: FakePasskeyHolder[] = [];

  seedHolder(holder: FakePasskeyHolder): void {
    this.seeded.push(holder);
  }

  async passkeyHolder(
    locationId: string,
    userId: string,
    activeScope: PasskeyHolderScope,
  ): Promise<{ id: string } | undefined> {
    const found = this.seeded.find(
      (holder) =>
        holder.id === userId &&
        holder.locationId === locationId &&
        (activeScope === "any" || holder.active === (activeScope === "active")),
    );
    return found && { id: found.id };
  }
}
