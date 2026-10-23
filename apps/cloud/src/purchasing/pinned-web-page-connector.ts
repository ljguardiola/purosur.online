import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

export interface WebPageConnection {
  status: number;
  headers: {
    location?: string | undefined;
    contentType?: string | undefined;
    contentLength?: number | undefined;
  };
  body: AsyncIterable<Uint8Array>;
}

export interface WebPageConnectionRequest {
  url: URL;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
}

export type WebPageConnector = (request: WebPageConnectionRequest) => Promise<WebPageConnection>;

export const connectPinned: WebPageConnector = ({ url, address, family, signal }) => {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = send(
      {
        host: url.hostname.replace(/^\[(.*)\]$/, "$1"),
        port: url.port === "" ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { "accept-encoding": "identity", "user-agent": "purosur-price-list-reader" },
        agent: false,
        lookup,
        signal,
      },
      (response) => {
        const contentLength = Number(response.headers["content-length"]);
        resolve({
          status: response.statusCode ?? 0,
          headers: {
            location: response.headers.location,
            contentType: response.headers["content-type"],
            contentLength: Number.isSafeInteger(contentLength) ? contentLength : undefined,
          },
          body: response,
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
};
