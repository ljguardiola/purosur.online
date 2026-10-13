export const REGISTER_UPDATE_HOLD_LIMIT_MS = 30_000;

export function isSafeMomentToUpdate(state: { hasOpenSale: boolean }): boolean {
  return !state.hasOpenSale;
}
