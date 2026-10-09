export const PASSKEY_AUTHORIZATION_WINDOW_MS = 5 * 60 * 1000;

export function hasValidPasskeyAuthorization(
  session: { passkeyAuthorizedAt: Date | null },
  now: Date,
): boolean {
  if (!session.passkeyAuthorizedAt) {
    return false;
  }
  return now.getTime() - session.passkeyAuthorizedAt.getTime() <= PASSKEY_AUTHORIZATION_WINDOW_MS;
}
