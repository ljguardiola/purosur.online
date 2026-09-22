import { BlockList, isIP } from "node:net";

export interface SourceAddressRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}

// Cloudflare's published edge ranges, from https://www.cloudflare.com/ips-v4 and
// https://www.cloudflare.com/ips-v6. Cloudflare changes them rarely and announces it; a missing
// new range only makes clients behind it share that edge's rate limit until this list is updated.
const CLOUDFLARE_IPV4_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
];
const CLOUDFLARE_IPV6_RANGES = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const cloudflareRanges = new BlockList();
for (const [ranges, family] of [
  [CLOUDFLARE_IPV4_RANGES, "ipv4"],
  [CLOUDFLARE_IPV6_RANGES, "ipv6"],
] as const) {
  for (const range of ranges) {
    const [network, prefix] = range.split("/");
    cloudflareRanges.addSubnet(network ?? "", Number(prefix), family);
  }
}

export function isCloudflareAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) {
    return false;
  }
  return cloudflareRanges.check(address, version === 4 ? "ipv4" : "ipv6");
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Railway terminates TLS and sets X-Real-IP to the connecting peer; `request.ip` is only a
 * fallback for an environment without that proxy in front (e.g. running the service directly in
 * tests). Staging's hostname is proxied by Cloudflare, so that peer is often a Cloudflare edge
 * shared by many clients: only then is Cloudflare's own CF-Connecting-IP trusted, since any
 * client can send that header straight to Railway. Shared by every `/users/recovery/*` route so
 * they all key their per-source-address rate limit the same way.
 */
export function resolveSourceAddress(request: SourceAddressRequest): string {
  const peer = singleHeader(request.headers["x-real-ip"]) ?? request.ip;
  if (!isCloudflareAddress(peer)) {
    return peer;
  }
  const client = singleHeader(request.headers["cf-connecting-ip"]);
  return client !== undefined && isIP(client) !== 0 ? client : peer;
}
