import { describe, expect, it, vi } from "vitest";
import { admitWebPageUrl, checkWebPageHost, type WebPageHostResolver } from "./web-page-host.js";

function admitted(raw: string): URL {
  const outcome = admitWebPageUrl(raw);
  if (outcome.kind !== "admitted") {
    throw new Error(`expected ${raw} to be admitted`);
  }
  return outcome.url;
}

describe("admitWebPageUrl", () => {
  it.each([
    "http://supplier.example/lista.pdf",
    "https://supplier.example:8443/precios?x=1#top",
    "HTTPS://Supplier.Example/",
  ])("admits %s", (raw) => {
    expect(admitWebPageUrl(raw).kind).toBe("admitted");
  });

  it.each([
    "ftp://supplier.example/lista.pdf",
    "file:///etc/passwd",
    "gopher://supplier.example/",
    "javascript:alert(1)",
    "data:text/html,hola",
    "https://user@supplier.example/",
    "https://user:secret@supplier.example/",
    "https://:secret@supplier.example/",
    "not a url",
    "",
    "/relative/path",
  ])("refuses %j as an invalid address", (raw) => {
    expect(admitWebPageUrl(raw)).toEqual({ kind: "refused", reason: "invalid_address" });
  });
});

describe("checkWebPageHost", () => {
  const publicResolver: WebPageHostResolver = async () => [{ address: "93.184.216.34", family: 4 }];

  it("answers the first resolved address of a name whose addresses are all public", async () => {
    const resolve: WebPageHostResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ];

    expect(await checkWebPageHost(admitted("https://supplier.example/"), resolve)).toEqual({
      kind: "checked",
      address: "93.184.216.34",
      family: 4,
    });
  });

  it("resolves the host name without brackets, once", async () => {
    const resolve = vi.fn(publicResolver);

    await checkWebPageHost(admitted("https://supplier.example:8443/x"), resolve);

    expect(resolve).toHaveBeenCalledExactlyOnceWith("supplier.example");
  });

  it("refuses a name when any of its addresses is not public", async () => {
    const resolve: WebPageHostResolver = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ];

    expect(await checkWebPageHost(admitted("https://supplier.example/"), resolve)).toEqual({
      kind: "refused",
      reason: "address_not_public",
    });
  });

  it("looks a name up once, so a later internal answer for it never matters", async () => {
    const resolve = vi
      .fn<WebPageHostResolver>()
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const outcome = await checkWebPageHost(admitted("https://rebind.example/"), resolve);

    expect(outcome).toEqual({ kind: "checked", address: "93.184.216.34", family: 4 });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("answers unreachable when the name does not resolve", async () => {
    const resolve: WebPageHostResolver = async () => {
      throw new Error("ENOTFOUND");
    };

    expect(await checkWebPageHost(admitted("https://missing.example/"), resolve)).toEqual({
      kind: "refused",
      reason: "unreachable",
    });
  });

  it("answers unreachable when the name resolves to no address", async () => {
    expect(await checkWebPageHost(admitted("https://empty.example/"), async () => [])).toEqual({
      kind: "refused",
      reason: "unreachable",
    });
  });

  it("resolves a trailing-dot name through the resolver", async () => {
    const resolve = vi.fn<WebPageHostResolver>(async () => [{ address: "127.0.0.1", family: 4 }]);

    expect(await checkWebPageHost(admitted("http://localhost./"), resolve)).toEqual({
      kind: "refused",
      reason: "address_not_public",
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  describe("a host written as an address", () => {
    it.each([
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://0x7f.1/",
      "http://0x7f000001/",
      "http://127.1/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[::127.0.0.1]/",
      "http://[::1]/",
      "http://[::]/",
      "http://0.0.0.0/",
      "http://169.254.169.254/latest/meta-data",
      "http://[fd00:ec2::254]/",
      "http://[fe80::1]/",
      "http://10.0.0.1:8080/",
      "http://192.168.1.1/",
      "http://[64:ff9b::7f00:1]/",
    ])("refuses %s without asking the resolver", async (raw) => {
      const resolve = vi.fn(publicResolver);

      expect(await checkWebPageHost(admitted(raw), resolve)).toEqual({
        kind: "refused",
        reason: "address_not_public",
      });
      expect(resolve).not.toHaveBeenCalled();
    });

    it.each([
      ["http://8.8.8.8/", "8.8.8.8", 4],
      ["http://134744072/", "8.8.8.8", 4],
      ["http://[2606:4700:4700::1111]:8080/", "2606:4700:4700::1111", 6],
      ["http://[::ffff:8.8.8.8]/", "::ffff:808:808", 6],
    ] as const)(
      "checks %s as the public address %s without asking the resolver",
      async (raw, address, family) => {
        const resolve = vi.fn(publicResolver);

        expect(await checkWebPageHost(admitted(raw), resolve)).toEqual({
          kind: "checked",
          address,
          family,
        });
        expect(resolve).not.toHaveBeenCalled();
      },
    );
  });
});
