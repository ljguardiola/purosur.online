import { describe, expect, it } from "vitest";
import { isCloudflareAddress, resolveSourceAddress } from "./recovery-source-address.js";

describe("resolveSourceAddress", () => {
  it("uses X-Real-IP when Railway's proxy sets it", () => {
    const address = resolveSourceAddress({
      headers: { "x-real-ip": "203.0.113.10" },
      ip: "127.0.0.1",
    });

    expect(address).toBe("203.0.113.10");
  });

  it("falls back to the connection's own address without a proxy in front", () => {
    const address = resolveSourceAddress({ headers: {}, ip: "127.0.0.1" });

    expect(address).toBe("127.0.0.1");
  });

  it("ignores a CF-Connecting-IP sent by a client that did not come through Cloudflare", () => {
    const address = resolveSourceAddress({
      headers: { "x-real-ip": "203.0.113.10", "cf-connecting-ip": "198.51.100.7" },
      ip: "127.0.0.1",
    });

    expect(address).toBe("203.0.113.10");
  });

  it("uses CF-Connecting-IP when the connecting peer is a Cloudflare IPv4 edge", () => {
    const address = resolveSourceAddress({
      headers: { "x-real-ip": "172.70.1.2", "cf-connecting-ip": "198.51.100.7" },
      ip: "127.0.0.1",
    });

    expect(address).toBe("198.51.100.7");
  });

  it("uses CF-Connecting-IP when the connecting peer is a Cloudflare IPv6 edge", () => {
    const address = resolveSourceAddress({
      headers: { "x-real-ip": "2a06:98c1:3120::3", "cf-connecting-ip": "2001:db8::7" },
      ip: "127.0.0.1",
    });

    expect(address).toBe("2001:db8::7");
  });

  it("keeps the Cloudflare edge address when CF-Connecting-IP is missing or not an address", () => {
    const missing = resolveSourceAddress({ headers: { "x-real-ip": "172.70.1.2" }, ip: "" });
    const malformed = resolveSourceAddress({
      headers: { "x-real-ip": "172.70.1.2", "cf-connecting-ip": "not-an-address" },
      ip: "",
    });

    expect(missing).toBe("172.70.1.2");
    expect(malformed).toBe("172.70.1.2");
  });
});

describe("isCloudflareAddress", () => {
  it.each([
    ["104.16.0.0", true],
    ["104.23.255.255", true],
    ["104.24.0.0", true],
    ["104.28.0.0", false],
    ["173.245.63.255", true],
    ["173.245.64.0", false],
    ["131.0.72.1", true],
    ["203.0.113.10", false],
  ])("matches the IPv4 address %s against Cloudflare's ranges: %s", (address, expected) => {
    expect(isCloudflareAddress(address)).toBe(expected);
  });

  it.each([
    ["2606:4700::1", true],
    ["2606:4700:ffff:ffff:ffff:ffff:ffff:ffff", true],
    ["2606:4701::1", false],
    ["2a06:98c7:ffff::1", true],
    ["2a06:98c8::1", false],
    ["2001:db8::1", false],
  ])("matches the IPv6 address %s against Cloudflare's ranges: %s", (address, expected) => {
    expect(isCloudflareAddress(address)).toBe(expected);
  });

  it("does not match something that is not an address", () => {
    expect(isCloudflareAddress("not-an-address")).toBe(false);
  });
});
