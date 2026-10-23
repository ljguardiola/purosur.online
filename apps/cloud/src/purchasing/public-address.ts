import { BlockList, isIP } from "node:net";

const NOT_PUBLIC_IPV4_RANGES = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

const NOT_PUBLIC_IPV6_RANGES = [
  "100::/64",
  "2001:db8::/32",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

const notPublicRanges = new BlockList();
for (const range of NOT_PUBLIC_IPV4_RANGES) {
  const [network, prefix] = range.split("/");
  notPublicRanges.addSubnet(network ?? "", Number(prefix), "ipv4");
}
for (const range of NOT_PUBLIC_IPV6_RANGES) {
  const [network, prefix] = range.split("/");
  notPublicRanges.addSubnet(network ?? "", Number(prefix), "ipv6");
}

const IPV6_BYTE_COUNT = 16;
const IPV4_PREFIX_BYTE_COUNT = 12;
const NAT64_PREFIX = [0x00, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0];

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return !notPublicRanges.check(address, "ipv4");
  }
  if (family === 6) {
    const bytes = ipv6Bytes(address);
    const embedded = embeddedIpv4(bytes);
    if (embedded !== undefined) {
      return !notPublicRanges.check(embedded, "ipv4");
    }
    return !notPublicRanges.check(address, "ipv6");
  }
  return false;
}

function embeddedIpv4(bytes: number[]): string | undefined {
  const prefix = bytes.slice(0, IPV4_PREFIX_BYTE_COUNT);
  const isCompatible = prefix.every((byte) => byte === 0);
  const isMapped = prefix.every((byte, index) => byte === (index < 10 ? 0 : 0xff));
  const isNat64 = prefix.every((byte, index) => byte === NAT64_PREFIX[index]);
  if (!isCompatible && !isMapped && !isNat64) {
    return undefined;
  }
  return bytes.slice(IPV4_PREFIX_BYTE_COUNT).join(".");
}

function ipv6Bytes(address: string): number[] {
  const withoutZone = address.split("%")[0] ?? address;
  const [head = "", tail] = withoutZone.split("::");
  const headGroups = groups(head);
  const tailGroups = tail === undefined ? [] : groups(tail);
  const missing = IPV6_BYTE_COUNT / 2 - headGroups.length - tailGroups.length;
  const all = [...headGroups, ...new Array<number>(Math.max(missing, 0)).fill(0), ...tailGroups];
  return all.flatMap((group) => [group >> 8, group & 0xff]);
}

function groups(part: string): number[] {
  if (part === "") {
    return [];
  }
  return part.split(":").flatMap((group) => {
    if (group.includes(".")) {
      const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
      return [(a << 8) | b, (c << 8) | d];
    }
    return [Number.parseInt(group, 16)];
  });
}
