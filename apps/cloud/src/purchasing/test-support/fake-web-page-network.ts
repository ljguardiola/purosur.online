import type {
  WebPageConnectionRequest,
  WebPageConnector,
} from "../pinned-web-page-connector.js";
import type { WebPageHostResolver } from "../web-page-host.js";

export interface FakePage {
  status?: number;
  location?: string;
  contentType?: string;
  contentLength?: number;
  chunks?: readonly Uint8Array[];
  body?: (signal: AbortSignal) => AsyncIterable<Uint8Array>;
}

export const text = (value: string) => new TextEncoder().encode(value);

export class FakeWebPageNetwork {
  readonly lookups: string[] = [];
  readonly connections: WebPageConnectionRequest[] = [];
  private readonly addresses = new Map<string, string[][]>();
  private readonly pages = new Map<string, FakePage | Error>();

  answerLookups(hostname: string, ...answers: string[][]): void {
    this.addresses.set(hostname, answers);
  }

  servePage(url: string, page: FakePage | Error): void {
    this.pages.set(url, page);
  }

  readonly resolve: WebPageHostResolver = async (hostname) => {
    const answers = this.addresses.get(hostname) ?? [];
    const answer = answers[Math.min(this.lookups.filter((name) => name === hostname).length, answers.length - 1)];
    this.lookups.push(hostname);
    if (answer === undefined) {
      throw new Error("ENOTFOUND");
    }
    return answer.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

  readonly connect: WebPageConnector = async (request) => {
    this.connections.push(request);
    const page = this.pages.get(request.url.href);
    if (page === undefined || page instanceof Error) {
      throw page ?? new Error("ECONNREFUSED");
    }
    const chunks = page.chunks ?? [];
    return {
      status: page.status ?? 200,
      headers: {
        location: page.location,
        contentType: page.contentType,
        contentLength: page.contentLength,
      },
      body: page.body?.(request.signal) ?? (async function* () { yield* chunks; })(),
    };
  };
}

export class FakeTimer {
  private callback: (() => void) | undefined;
  scheduledMs: number | undefined;
  cancelled = false;

  readonly start = (callback: () => void, ms: number): (() => void) => {
    this.callback = callback;
    this.scheduledMs = ms;
    return () => {
      this.cancelled = true;
    };
  };

  fire(): void {
    this.callback?.();
  }
}
