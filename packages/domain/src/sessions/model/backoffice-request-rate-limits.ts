export const BACKOFFICE_REQUEST_WINDOW_MS = 60 * 60 * 1000;
export const BACKOFFICE_SESSION_REQUEST_LIMIT = 6000;
export const BACKOFFICE_SOURCE_ADDRESS_REQUEST_LIMIT = 12000;

export function backofficeRequestWindowStart(now: Date): Date {
  return new Date(now.getTime() - BACKOFFICE_REQUEST_WINDOW_MS);
}
