import { lookup } from "node:dns/promises";
import {
  SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES,
  SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS,
  SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS,
  type SupplierPriceListWebPageRefusal,
} from "@purosur/domain";
import type {
  SupplierPriceListWebPageRead,
  SupplierPriceListWebPages,
} from "@purosur/domain/purchasing/use-cases";
import { hasPdfSignature } from "./pdf-signature.js";
import {
  connectPinned,
  type WebPageConnection,
  type WebPageConnector,
} from "./pinned-web-page-connector.js";
import { tiendistaStoreProductDataUrl } from "./tiendista-store.js";
import { admitWebPageUrl, checkWebPageHost, type WebPageHostResolver } from "./web-page-host.js";
import { startsWithUtf8ByteOrderMark, UTF8_BYTE_ORDER_MARK } from "./web-page-text.js";

export interface GuardedWebPageReaderDependencies {
  resolve: WebPageHostResolver;
  connect: WebPageConnector;
  startTimer: (onElapsed: () => void, milliseconds: number) => () => void;
}

const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const HTML_MEDIA_TYPES = ["text/html", "application/xhtml+xml"];
const PDF_MEDIA_TYPE = "application/pdf";
const JSON_MEDIA_TYPE = "application/json";

export class GuardedWebPageReader implements SupplierPriceListWebPages {
  private readonly dependencies: GuardedWebPageReaderDependencies;

  constructor(dependencies: GuardedWebPageReaderDependencies) {
    this.dependencies = dependencies;
  }

  async read(url: string): Promise<SupplierPriceListWebPageRead> {
    const controller = new AbortController();
    let timedOut = false;
    const cancelTimer = this.dependencies.startTimer(() => {
      timedOut = true;
      controller.abort();
    }, SUPPLIER_PRICE_LIST_WEB_PAGE_TIME_LIMIT_MS);
    try {
      const productDataUrl = tiendistaStoreProductDataUrl(url);
      return await this.follow(
        productDataUrl ?? url,
        controller.signal,
        productDataUrl === null ? "page" : "store_catalog",
      );
    } catch {
      return refused(timedOut ? "too_slow" : "unreachable");
    } finally {
      cancelTimer();
      controller.abort();
    }
  }

  private async follow(
    address: string,
    signal: AbortSignal,
    expected: "page" | "store_catalog",
  ): Promise<SupplierPriceListWebPageRead> {
    let current = address;
    for (let redirects = 0; ; redirects += 1) {
      const admission = admitWebPageUrl(current);
      if (admission.kind === "refused") {
        return refused(admission.reason);
      }
      const { url } = admission;
      const host = await untilAborted(checkWebPageHost(url, this.dependencies.resolve), signal);
      if (host.kind === "refused") {
        return refused(host.reason);
      }
      const connection = await this.dependencies.connect({
        url,
        address: host.address,
        family: host.family,
        signal,
      });
      if (!REDIRECT_STATUSES.includes(connection.status)) {
        return readPage(connection, expected);
      }
      const location = connection.headers.location;
      if (location === undefined) {
        return refused("unreachable");
      }
      if (redirects >= SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_REDIRECTS) {
        return refused("too_many_redirects");
      }
      const next = URL.parse(location, url);
      if (next === null) {
        return refused("invalid_address");
      }
      current = next.href;
    }
  }
}

export function createGuardedWebPageReader(): SupplierPriceListWebPages {
  return new GuardedWebPageReader({
    resolve: (hostname) => lookup(hostname, { all: true, verbatim: true }),
    connect: connectPinned,
    startTimer: (onElapsed, milliseconds) => {
      const timeout = setTimeout(onElapsed, milliseconds);
      return () => clearTimeout(timeout);
    },
  });
}

async function readPage(
  connection: WebPageConnection,
  expected: "page" | "store_catalog",
): Promise<SupplierPriceListWebPageRead> {
  if (connection.status < 200 || connection.status > 299) {
    return refused("unreachable");
  }
  const { contentLength, contentType } = connection.headers;
  if (contentLength !== undefined && contentLength > SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES) {
    return refused("too_large");
  }
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const contentKind = contentKindOf(mediaType, expected);
  if (contentKind === undefined) {
    return refused("unsupported_content");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of connection.body) {
    total += chunk.length;
    if (total > SUPPLIER_PRICE_LIST_WEB_PAGE_MAX_BYTES) {
      return refused("too_large");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (contentKind === "PDF" && !hasPdfSignature(bytes)) {
    return refused("unsupported_content");
  }
  return {
    kind: "read",
    contentKind,
    bytes: contentKind === "HTML" ? inUtf8(bytes, contentType ?? "") : bytes,
  };
}

function contentKindOf(
  mediaType: string,
  expected: "page" | "store_catalog",
): "PDF" | "HTML" | "STORE_CATALOG" | undefined {
  if (expected === "store_catalog") {
    return mediaType === JSON_MEDIA_TYPE ? "STORE_CATALOG" : undefined;
  }
  if (mediaType === PDF_MEDIA_TYPE) {
    return "PDF";
  }
  return HTML_MEDIA_TYPES.includes(mediaType) ? "HTML" : undefined;
}

function inUtf8(html: Uint8Array, contentType: string): Uint8Array {
  const label = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1];
  if (label === undefined || startsWithUtf8ByteOrderMark(html)) {
    return html;
  }
  let decoded: string;
  try {
    decoded = new TextDecoder(label).decode(html);
  } catch {
    return html;
  }
  return Uint8Array.from([...UTF8_BYTE_ORDER_MARK, ...new TextEncoder().encode(decoded)]);
}

function refused(reason: SupplierPriceListWebPageRefusal): SupplierPriceListWebPageRead {
  return { kind: "refused", reason };
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    promise.then(resolve, reject);
  });
}
