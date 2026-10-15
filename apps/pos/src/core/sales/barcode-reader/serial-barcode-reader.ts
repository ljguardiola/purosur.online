import { createBarcodeReaderLines } from "./barcode-reader-lines.js";
import type { SerialLink } from "../serial-link/open-serial-link.js";

interface ReaderTimers {
  after(delayMs: number, run: () => void): () => void;
}

export interface SerialBarcodeReaderDeps {
  path: () => string | undefined;
  openLink: (path: string) => Promise<SerialLink>;
  onCode: (code: string) => void;
  onFailure: (error: unknown) => void;
  retryMs: number;
  timers?: ReaderTimers;
}

export interface SerialBarcodeReader {
  sync(): Promise<void>;
}

const realTimers: ReaderTimers = {
  after(delayMs, run) {
    const handle = setTimeout(run, delayMs);
    return () => clearTimeout(handle);
  },
};

interface OpenLink {
  path: string;
  link: SerialLink;
  lost: boolean;
}

export function createSerialBarcodeReader({
  path,
  openLink,
  onCode,
  onFailure,
  retryMs,
  timers = realTimers,
}: SerialBarcodeReaderDeps): SerialBarcodeReader {
  let open: OpenLink | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let cancelRetry: (() => void) | undefined;
  let failing = false;

  function drop(): void {
    if (open !== undefined) {
      open.lost = true;
      open.link.close();
    }
    open = undefined;
  }

  function clearRetry(): void {
    cancelRetry?.();
    cancelRetry = undefined;
  }

  function scheduleRetry(): void {
    if (cancelRetry !== undefined) return;
    cancelRetry = timers.after(retryMs, () => {
      cancelRetry = undefined;
      void run();
    });
  }

  async function connect(wanted: string): Promise<void> {
    try {
      const link = await openLink(wanted);
      const opened: OpenLink = { path: wanted, link, lost: false };
      const lines = createBarcodeReaderLines();
      const lose = (): void => {
        if (opened.lost) return;
        opened.lost = true;
        scheduleRetry();
      };
      link.on("data", (chunk) => {
        if (opened.lost) return;
        for (const code of lines.feed(chunk)) onCode(code);
      });
      link.on("error", lose);
      link.on("close", lose);
      open = opened;
      failing = false;
    } catch (error) {
      if (!failing) {
        failing = true;
        onFailure(error);
      }
      scheduleRetry();
    }
  }

  async function runOnce(): Promise<void> {
    const wanted = path();
    if (wanted === undefined) {
      drop();
      clearRetry();
      failing = false;
      return;
    }
    if (open !== undefined && (open.lost || open.path !== wanted)) {
      drop();
    }
    if (open === undefined) {
      clearRetry();
      await connect(wanted);
    }
  }

  function run(): Promise<void> {
    const running = queue.then(runOnce, runOnce);
    queue = running;
    return running;
  }

  return {
    sync: run,
  };
}
