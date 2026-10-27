import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createSecureServer, type Server as SecureServer } from "node:https";
import type { AddressInfo } from "node:net";
import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { selfSignedCertificateFor } from "../platform/test-support/self-signed-certificate.js";
import { connectPinned } from "./pinned-web-page-connector.js";
import { deferred } from "./test-support/deferred.js";

let server: Server | undefined;
let secureServer: SecureServer | undefined;

afterEach(async () => {
  if (secureServer !== undefined) {
    const closing = new Promise((resolve) => secureServer?.close(resolve));
    secureServer.closeAllConnections();
    await closing;
    secureServer = undefined;
  }
  if (server !== undefined) {
    const closing = new Promise((resolve) => server?.close(resolve));
    server.closeAllConnections();
    await closing;
    server = undefined;
  }
});

async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<number> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

async function readAll(body: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe("connectPinned", () => {
  it("reaches the pinned address whatever the name of the host is, keeping the name in the Host header", async () => {
    let received: IncomingMessage | undefined;
    const port = await serve((request, response) => {
      received = request;
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<p>hola</p>");
    });

    const connection = await connectPinned({
      url: new URL(`http://supplier.example:${port}/precios?x=1`),
      address: "127.0.0.1",
      family: 4,
      signal: new AbortController().signal,
    });

    expect(connection.status).toBe(200);
    expect(await readAll(connection.body)).toBe("<p>hola</p>");
    expect(received?.headers["host"]).toBe(`supplier.example:${port}`);
    expect(received?.method).toBe("GET");
    expect(received?.url).toBe("/precios?x=1");
  });

  it("asks for the page as it is, without cookies, with a plain user agent", async () => {
    let received: IncomingMessage | undefined;
    const port = await serve((request, response) => {
      received = request;
      response.end();
    });

    const connection = await connectPinned({
      url: new URL(`http://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: new AbortController().signal,
    });
    await readAll(connection.body);

    expect(received?.headers["accept-encoding"]).toBe("identity");
    expect(received?.headers["cookie"]).toBeUndefined();
    expect(received?.headers["authorization"]).toBeUndefined();
    expect(received?.headers["user-agent"]).toMatch(/^[\w./ ()-]+$/);
  });

  it("answers the status and the headers of a redirect without following it", async () => {
    const port = await serve((_request, response) => {
      response.writeHead(302, { location: "http://127.0.0.1:1/" });
      response.end();
    });

    const connection = await connectPinned({
      url: new URL(`http://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: new AbortController().signal,
    });

    expect(connection.status).toBe(302);
    expect(connection.headers.location).toBe("http://127.0.0.1:1/");
  });

  it("answers the content type and the content length of the page", async () => {
    const port = await serve((_request, response) => {
      response.writeHead(200, { "content-type": "application/pdf", "content-length": "5" });
      response.end("%PDF-");
    });

    const connection = await connectPinned({
      url: new URL(`http://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: new AbortController().signal,
    });

    expect(connection.headers.contentType).toBe("application/pdf");
    expect(connection.headers.contentLength).toBe(5);
  });

  it("leaves out a content length that is not a number", async () => {
    const port = await serve((_request, response) => {
      response.writeHead(200, { "transfer-encoding": "chunked" });
      response.end("hola");
    });

    const connection = await connectPinned({
      url: new URL(`http://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: new AbortController().signal,
    });

    expect(connection.headers.contentLength).toBeUndefined();
  });

  it("fails when the signal aborts before the server answers", async () => {
    const requestArrived = deferred();
    const port = await serve(() => requestArrived.resolve());
    const controller = new AbortController();

    const connecting = connectPinned({
      url: new URL(`http://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: controller.signal,
    });
    await requestArrived.promise;
    controller.abort();

    await expect(connecting).rejects.toThrow();
  });

  it("fails reading the body when the signal aborts in the middle of it", async () => {
    const port = await serve((_request, response) => {
      response.write("primera parte");
    });
    const controller = new AbortController();
    const connection = await connectPinned({
      url: new URL(`http://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: controller.signal,
    });

    const reading = (async () => {
      for await (const _chunk of connection.body) {
        controller.abort();
      }
    })();

    await expect(reading).rejects.toThrow();
  });

  it("fails when nothing listens at the pinned address", async () => {
    const port = await serve((_request, response) => response.end());
    await new Promise((resolve) => server?.close(resolve));
    server = undefined;

    await expect(
      connectPinned({
        url: new URL(`http://supplier.example:${port}/`),
        address: "127.0.0.1",
        family: 4,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  });
});

describe("connectPinned over HTTPS", () => {
  const trusted = [
    selfSignedCertificateFor("supplier.example"),
    selfSignedCertificateFor("other.example"),
  ];
  const [certificateOfSupplier, certificateOfOther] = trusted;
  let defaultCertificates: string[];

  beforeAll(() => {
    defaultCertificates = getCACertificates("default");
    setDefaultCACertificates([...defaultCertificates, ...trusted.map(({ cert }) => cert)]);
  });

  afterAll(() => {
    setDefaultCACertificates(defaultCertificates);
  });

  async function serveSecurely(certificate: { key: string; cert: string }): Promise<number> {
    const secure = createSecureServer(certificate, (_request, response) => {
      response.setHeader("content-type", "text/html");
      response.end("<p>hola</p>");
    });
    secureServer = secure;
    await new Promise<void>((resolve) => secure.listen(0, "127.0.0.1", resolve));
    return (secure.address() as AddressInfo).port;
  }

  it("reaches the pinned address while the certificate proves the name of the address", async () => {
    const port = await serveSecurely(certificateOfSupplier as { key: string; cert: string });

    const connection = await connectPinned({
      url: new URL(`https://supplier.example:${port}/`),
      address: "127.0.0.1",
      family: 4,
      signal: new AbortController().signal,
    });

    expect(connection.status).toBe(200);
    expect(await readAll(connection.body)).toBe("<p>hola</p>");
  });

  it("refuses a certificate that proves another name, though the pinned address answers", async () => {
    const port = await serveSecurely(certificateOfOther as { key: string; cert: string });

    await expect(
      connectPinned({
        url: new URL(`https://supplier.example:${port}/`),
        address: "127.0.0.1",
        family: 4,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
  });
});
