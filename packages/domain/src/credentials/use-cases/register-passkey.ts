import type { PasskeyRegistrationStore } from "./passkey-registration-store.js";
import type { PasskeySummary } from "./passkeys.js";
import { PasskeyAlreadyRegistered, type RecoveredPasskey } from "./recovery-redemption-store.js";

export interface RegisterPasskeyPorts {
  store: PasskeyRegistrationStore;
}

export interface RegisterPasskeyInput {
  userId: string;
  passkey: Omit<RecoveredPasskey, "userId">;
  at: Date;
}

export type RegisterPasskeyOutcome =
  | { kind: "registered"; passkey: PasskeySummary }
  | { kind: "passkey_already_registered" };

export async function registerPasskey(
  { store }: RegisterPasskeyPorts,
  input: RegisterPasskeyInput,
): Promise<RegisterPasskeyOutcome> {
  const passkey: RecoveredPasskey = { ...input.passkey, userId: input.userId };

  try {
    return await store.transaction<RegisterPasskeyOutcome>(async (tx) => {
      const added = await tx.addPasskey(passkey);
      await tx.recordPasskeyRegistered(input.userId, added, passkey);
      await tx.openPasskeyRegisteredAlert({
        userId: input.userId,
        passkeyName: passkey.name,
        openedAt: input.at,
      });
      return {
        kind: "registered",
        passkey: { id: added.id, name: passkey.name, createdAt: added.createdAt, lastUsedAt: null },
      };
    });
  } catch (error) {
    if (error instanceof PasskeyAlreadyRegistered) {
      return { kind: "passkey_already_registered" };
    }
    throw error;
  }
}
