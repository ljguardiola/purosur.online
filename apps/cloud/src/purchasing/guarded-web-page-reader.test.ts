import {
  SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES,
  SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS,
  SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS,
} from "@purosur/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { GuardedWebPageReader } from "./guarded-web-page-reader.js";
import { deferred } from "./test-support/deferred.js";
import { FakeTimer, FakeWebPageNetwork, text } from "./test-support/fake-web-page-network.js";

const PUBLIC_ADDRESS = "93.184.216.34";
const OTHER_PUBLIC_ADDRESS = "151.101.1.69";
const PAGE = "https://supplier.example/precios";

let network: FakeWebPageNetwork;
let timer: FakeTimer;
let reader: GuardedWebPageReader;

beforeEach(() => {
  network = new FakeWebPageNetwork();
  timer = new FakeTimer();
  reader = new GuardedWebPageReader({
    resolve: network.resolve,
    connect: network.connect,
    startTimer: timer.start,
  });
  network.answerLookups("supplier.example", [PUBLIC_ADDRESS]);
});

const html = (body: string) => ({ contentType: "text/html", chunks: [text(body)] });

describe("GuardedWebPageReader", () => {
  describe("reading a page", () => {
    it("reads the bytes of an HTML page", async () => {
      network.servePage(PAGE, html("<p>hola</p>"));

      expect(await reader.read(PAGE)).toEqual({
        kind: "read",
        contentKind: "HTML",
        bytes: text("<p>hola</p>"),
      });
    });

    it("joins the chunks of the body", async () => {
      network.servePage(PAGE, {
        contentType: "text/html",
        chunks: [text("<p>ho"), text("la</p>")],
      });

      expect(await reader.read(PAGE)).toMatchObject({ bytes: text("<p>hola</p>") });
    });

    it("connects to the address that was checked, naming the page it asked for", async () => {
      network.servePage(PAGE, html("x"));

      await reader.read(PAGE);

      expect(network.connections).toHaveLength(1);
      expect(network.connections[0]).toMatchObject({ address: PUBLIC_ADDRESS, family: 4 });
      expect(network.connections[0]?.url.href).toBe(PAGE);
    });

    it("reads a page on any port", async () => {
      network.servePage("http://supplier.example:8080/x", html("x"));

      expect(await reader.read("http://supplier.example:8080/x")).toMatchObject({ kind: "read" });
    });

    it("never retries a failed connection", async () => {
      network.servePage(PAGE, new Error("ECONNRESET"));

      await reader.read(PAGE);

      expect(network.connections).toHaveLength(1);
      expect(network.lookups).toHaveLength(1);
    });
  });

  describe("the kind of content", () => {
    it.each([
      "text/html",
      "TEXT/HTML; charset=utf-8",
      "application/xhtml+xml",
      "Application/XHTML+XML;charset=UTF-8",
    ])("reads %s as HTML", async (contentType) => {
      network.servePage(PAGE, { contentType, chunks: [text("<p>x</p>")] });

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read", contentKind: "HTML" });
    });

    it.each(["application/pdf", "Application/PDF; charset=binary"])(
      "reads %s as a PDF when it starts with the PDF signature",
      async (contentType) => {
        network.servePage(PAGE, { contentType, chunks: [text("%PDF-1.7 resto")] });

        expect(await reader.read(PAGE)).toEqual({
          kind: "read",
          contentKind: "PDF",
          bytes: text("%PDF-1.7 resto"),
        });
      },
    );

    it("refuses a PDF whose bytes are not a PDF", async () => {
      network.servePage(PAGE, { contentType: "application/pdf", chunks: [text("<html>")] });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "unsupported_content" });
    });

    it("recognizes the PDF signature across chunks", async () => {
      network.servePage(PAGE, {
        contentType: "application/pdf",
        chunks: [text("%P"), text("DF-"), text("1.4")],
      });

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read", contentKind: "PDF" });
    });

    it.each([
      "image/png",
      "application/zip",
      "application/octet-stream",
      "text/plain",
      "application/json",
      "",
      undefined,
    ])("refuses the content type %j", async (contentType) => {
      network.servePage(PAGE, { contentType, chunks: [text("%PDF-")] });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "unsupported_content" });
    });
  });

  describe("the address", () => {
    it.each([
      "ftp://supplier.example/lista",
      "file:///etc/passwd",
      "https://user:secret@supplier.example/",
      "https://user@supplier.example/",
      "not a url",
    ])("refuses %j as an invalid address without resolving anything", async (url) => {
      expect(await reader.read(url)).toEqual({ kind: "refused", reason: "invalid_address" });
      expect(network.lookups).toEqual([]);
      expect(network.connections).toEqual([]);
    });

    it("refuses a name that resolves to an internal address without connecting", async () => {
      network.answerLookups("intranet.example", ["10.0.0.7"]);

      expect(await reader.read("https://intranet.example/")).toEqual({
        kind: "refused",
        reason: "address_not_public",
      });
      expect(network.connections).toEqual([]);
    });

    it("refuses a name that resolves to a public and an internal address", async () => {
      network.answerLookups("mixed.example", [PUBLIC_ADDRESS, "192.168.0.10"]);

      expect(await reader.read("https://mixed.example/")).toEqual({
        kind: "refused",
        reason: "address_not_public",
      });
      expect(network.connections).toEqual([]);
    });

    it.each([
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data",
    ])("refuses the address written in %s without resolving anything", async (url) => {
      expect(await reader.read(url)).toEqual({ kind: "refused", reason: "address_not_public" });
      expect(network.lookups).toEqual([]);
      expect(network.connections).toEqual([]);
    });

    it("answers unreachable when the name does not resolve", async () => {
      expect(await reader.read("https://missing.example/")).toEqual({
        kind: "refused",
        reason: "unreachable",
      });
    });

    it("never carries the resolved address in what it answers", async () => {
      network.answerLookups("intranet.example", ["10.1.2.3"]);
      network.servePage(PAGE, new Error("connect ECONNREFUSED 93.184.216.34:443"));

      const refusals = [
        await reader.read("https://intranet.example/"),
        await reader.read("http://192.168.7.8/"),
        await reader.read(PAGE),
      ];

      for (const refusal of refusals) {
        expect(JSON.stringify(refusal)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
      }
    });
  });

  describe("redirects", () => {
    it("follows a redirect to another page, checking it again", async () => {
      network.answerLookups("cdn.example", [OTHER_PUBLIC_ADDRESS]);
      network.servePage(PAGE, { status: 301, location: "https://cdn.example/lista" });
      network.servePage("https://cdn.example/lista", html("<p>lista</p>"));

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read", bytes: text("<p>lista</p>") });
      expect(network.connections.map(({ address }) => address)).toEqual([
        PUBLIC_ADDRESS,
        OTHER_PUBLIC_ADDRESS,
      ]);
    });

    it("resolves a relative location against the page that redirected", async () => {
      network.servePage(PAGE, { status: 302, location: "../lista?v=2" });
      network.servePage("https://supplier.example/lista?v=2", html("<p>2</p>"));

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read", bytes: text("<p>2</p>") });
    });

    it.each([301, 302, 303, 307, 308])("follows a %i redirect", async (status) => {
      network.servePage(PAGE, { status, location: "/otra" });
      network.servePage("https://supplier.example/otra", html("x"));

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read" });
    });

    it("refuses a redirect to an internal address without ever connecting to it", async () => {
      network.servePage(PAGE, { status: 302, location: "http://169.254.169.254/latest/meta-data" });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "address_not_public" });
      expect(network.connections).toHaveLength(1);
      expect(network.connections[0]?.url.href).toBe(PAGE);
    });

    it("refuses a redirect to a name that resolves to an internal address", async () => {
      network.answerLookups("internal.example", ["10.0.0.9"]);
      network.servePage(PAGE, { status: 302, location: "https://internal.example/" });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "address_not_public" });
      expect(network.connections).toHaveLength(1);
    });

    it.each(["ftp://supplier.example/lista", "https://user:pass@supplier.example/lista"])(
      "refuses a redirect to %s as an invalid address",
      async (location) => {
        network.servePage(PAGE, { status: 302, location });

        expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "invalid_address" });
        expect(network.connections).toHaveLength(1);
      },
    );

    it("answers unreachable for a redirect without a location", async () => {
      network.servePage(PAGE, { status: 302 });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "unreachable" });
    });

    it("follows as many redirects as the limit allows and refuses the next one", async () => {
      expect(SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS).toBe(3);
      network.servePage(PAGE, { status: 302, location: "/1" });
      network.servePage("https://supplier.example/1", { status: 302, location: "/2" });
      network.servePage("https://supplier.example/2", { status: 302, location: "/3" });
      network.servePage("https://supplier.example/3", html("<p>tres</p>"));

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read", bytes: text("<p>tres</p>") });

      network.servePage("https://supplier.example/3", { status: 302, location: "/4" });
      network.servePage("https://supplier.example/4", html("<p>cuatro</p>"));
      network.connections.length = 0;

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "too_many_redirects" });
      expect(network.connections.map(({ url }) => url.pathname)).toEqual([
        "/precios",
        "/1",
        "/2",
        "/3",
      ]);
    });

    it("refuses a page that redirects to itself", async () => {
      network.servePage(PAGE, { status: 302, location: PAGE });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "too_many_redirects" });
    });
  });

  describe("DNS rebinding", () => {
    it("connects to the address that was checked, resolving each name once per hop", async () => {
      network.answerLookups("rebind.example", [PUBLIC_ADDRESS], ["127.0.0.1"], ["169.254.169.254"]);
      network.servePage("https://rebind.example/", html("<p>x</p>"));

      expect(await reader.read("https://rebind.example/")).toMatchObject({ kind: "read" });
      expect(network.lookups).toEqual(["rebind.example"]);
      expect(network.connections[0]?.address).toBe(PUBLIC_ADDRESS);
    });

    it("resolves the name again for every hop and pins each hop to its own checked address", async () => {
      network.answerLookups("rebind.example", [PUBLIC_ADDRESS], ["127.0.0.1"]);
      network.servePage("https://rebind.example/", { status: 302, location: "/second" });
      network.servePage("https://rebind.example/second", html("x"));

      expect(await reader.read("https://rebind.example/")).toEqual({
        kind: "refused",
        reason: "address_not_public",
      });
      expect(network.lookups).toEqual(["rebind.example", "rebind.example"]);
      expect(network.connections).toHaveLength(1);
    });
  });

  describe("size", () => {
    it("refuses a page whose content length is over the limit without reading its body", async () => {
      let bodyRequested = false;
      network.servePage(PAGE, {
        contentType: "text/html",
        contentLength: SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES + 1,
        body: () => ({
          [Symbol.asyncIterator]: () => {
            bodyRequested = true;
            return { next: async () => ({ done: true, value: undefined }) };
          },
        }),
      });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "too_large" });
      expect(bodyRequested).toBe(false);
    });

    it("reads a page whose content length is exactly the limit", async () => {
      const bytes = new Uint8Array(SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES);
      network.servePage(PAGE, {
        contentType: "text/html",
        contentLength: bytes.length,
        chunks: [bytes],
      });

      expect(await reader.read(PAGE)).toMatchObject({ kind: "read" });
    });

    it("stops reading a body that grows past the limit without announcing it, aborting the connection", async () => {
      let signalOfConnection: AbortSignal | undefined;
      let chunksRead = 0;
      network.servePage(PAGE, {
        contentType: "text/html",
        body: (signal) => {
          signalOfConnection = signal;
          return (async function* () {
            const chunk = new Uint8Array(SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES / 2);
            for (let index = 0; index < 100; index += 1) {
              chunksRead += 1;
              yield chunk;
            }
          })();
        },
      });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "too_large" });
      expect(chunksRead).toBe(3);
      expect(signalOfConnection?.aborted).toBe(true);
    });
  });

  describe("time", () => {
    it("starts one timer with the time limit of the model and cancels it when done", async () => {
      network.servePage(PAGE, html("x"));

      await reader.read(PAGE);

      expect(timer.scheduledMs).toBe(SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS);
      expect(timer.cancelled).toBe(true);
    });

    it("refuses as too slow when the time runs out while connecting, aborting the connection", async () => {
      let signalOfConnection: AbortSignal | undefined;
      const connecting = deferred();
      const slow = new FakeWebPageNetwork();
      slow.answerLookups("supplier.example", [PUBLIC_ADDRESS]);
      const slowReader = new GuardedWebPageReader({
        resolve: slow.resolve,
        connect: ({ signal }) =>
          new Promise((_resolve, reject) => {
            signalOfConnection = signal;
            connecting.resolve();
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        startTimer: timer.start,
      });

      const reading = slowReader.read(PAGE);
      await connecting.promise;
      timer.fire();

      expect(await reading).toEqual({ kind: "refused", reason: "too_slow" });
      expect(signalOfConnection?.aborted).toBe(true);
    });

    it("refuses as too slow when the time runs out while resolving the name", async () => {
      const lookingUp = deferred();
      const slowReader = new GuardedWebPageReader({
        resolve: async () => {
          lookingUp.resolve();
          return new Promise(() => {});
        },
        connect: network.connect,
        startTimer: timer.start,
      });

      const reading = slowReader.read(PAGE);
      await lookingUp.promise;
      timer.fire();

      expect(await reading).toEqual({ kind: "refused", reason: "too_slow" });
      expect(network.connections).toEqual([]);
    });

    it("refuses as too slow when the time runs out while reading the body", async () => {
      const reading = deferred();
      let signalOfConnection: AbortSignal | undefined;
      network.servePage(PAGE, {
        contentType: "text/html",
        body: (signal) => {
          signalOfConnection = signal;
          return (async function* () {
            yield text("<p>");
            reading.resolve();
            await new Promise((_resolve, reject) =>
              signal.addEventListener("abort", () => reject(new Error("aborted"))),
            );
          })();
        },
      });

      const outcome = reader.read(PAGE);
      await reading.promise;
      timer.fire();

      expect(await outcome).toEqual({ kind: "refused", reason: "too_slow" });
      expect(signalOfConnection?.aborted).toBe(true);
    });
  });

  describe("failures", () => {
    it.each([404, 403, 500, 503])("answers unreachable for a %i status", async (status) => {
      network.servePage(PAGE, { status, ...html("x") });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "unreachable" });
    });

    it("answers unreachable when the connection fails", async () => {
      network.servePage(PAGE, new Error("ECONNREFUSED"));

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "unreachable" });
    });

    it("answers unreachable when the body fails halfway", async () => {
      network.servePage(PAGE, {
        contentType: "text/html",
        body: () =>
          (async function* () {
            yield text("<p>");
            throw new Error("ECONNRESET");
          })(),
      });

      expect(await reader.read(PAGE)).toEqual({ kind: "refused", reason: "unreachable" });
    });
  });
});
