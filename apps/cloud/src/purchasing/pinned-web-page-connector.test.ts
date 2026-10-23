import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { connectPinned } from "./pinned-web-page-connector.js";

let server: Server | undefined;

afterEach(async () => {
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
    const requestArrived = Promise.withResolvers<void>();
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
