export interface PinReplacementStore<Credential> {
  savePinCredential(userId: string, credential: Credential | undefined): boolean;
  clearPinSignInFailures(userId: string): void;
}

export interface PinReplacementPorts<Credential> {
  store: PinReplacementStore<Credential>;
}

export interface ReplacePinInput<Credential> {
  userId: string;
  credential: Credential | undefined;
}

export function replacePin<Credential>(
  { store }: PinReplacementPorts<Credential>,
  { userId, credential }: ReplacePinInput<Credential>,
): void {
  const changed = store.savePinCredential(userId, credential);
  if (credential === undefined || changed) {
    store.clearPinSignInFailures(userId);
  }
}
