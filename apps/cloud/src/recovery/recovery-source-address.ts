export interface SourceAddressRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}

/**
 * Railway terminates TLS and sets X-Real-IP; `request.ip` is only a fallback for an environment
 * without that proxy in front (e.g. running the service directly in tests). Shared by every
 * `/users/recovery/*` route so they all key their per-source-address rate limit the same way.
 */
export function resolveSourceAddress(request: SourceAddressRequest): string {
  const forwardedIp = request.headers["x-real-ip"];
  return typeof forwardedIp === "string" ? forwardedIp : request.ip;
}
