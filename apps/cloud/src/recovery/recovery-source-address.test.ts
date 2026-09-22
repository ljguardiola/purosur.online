import { describe, expect, it } from "vitest";
import { resolveSourceAddress } from "./recovery-source-address.js";

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
});
