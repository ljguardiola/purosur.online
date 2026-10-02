// Once the counter has left zero, a non-increasing counter means a cloned authenticator.
export function isPasskeyCloneSignal(storedCounter: number, newCounter: number): boolean {
  return storedCounter > 0 && newCounter <= storedCounter;
}
