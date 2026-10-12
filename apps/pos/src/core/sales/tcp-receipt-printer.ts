import { createConnection } from "node:net";
import type { ReceiptPrinterAddress } from "@purosur/domain";
import type {
  ReceiptPrintEnding,
  ReceiptPrinter,
  ReceiptPrintWatch,
} from "@purosur/domain/sales/use-cases";
import { RAW_PRINTING_PORT, reachSameReceiptPrinter } from "../register/receipt-printer-endpoint";

type PrinterStatus = Parameters<ReceiptPrintWatch["onStatus"]>[0];

const POLL_INTERVAL_MS = 500;
const CONNECT_LIMIT_MS = 3000;
const UNANSWERED_POLLS_BEFORE_SILENCE = 2;

// DLE EOT 2: real-time transmit of the offline cause status.
const STATUS_QUERY = Uint8Array.of(0x10, 0x04, 0x02);
// A status byte always has bit0=0, bit1=1, bit4=1 and bit7=0.
const STATUS_FIXED_BITS_MASK = 0x93;
const STATUS_FIXED_BITS = 0x12;
const COVER_OPEN_BIT = 0x04;
const PAPER_END_BIT = 0x20;
const FEED_BUTTON_BIT = 0x08;
const ERROR_BIT = 0x40;

export interface PrinterSocket {
  on(event: "connect", listener: () => void): unknown;
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "error" | "close", listener: () => void): unknown;
  write(data: Uint8Array): unknown;
  end(): unknown;
  destroy(): unknown;
}

export interface PrinterTimers {
  after(delayMs: number, run: () => void): () => void;
}

export interface TcpReceiptPrinterOptions {
  address: () => ReceiptPrinterAddress | undefined;
  timers?: PrinterTimers;
  connect?: (port: number, host: string) => PrinterSocket;
}

const realTimers: PrinterTimers = {
  after(delayMs, run) {
    const handle = setTimeout(run, delayMs);
    return () => clearTimeout(handle);
  },
};

function statusOf(byte: number): PrinterStatus {
  if ((byte & COVER_OPEN_BIT) !== 0) return "cover_open";
  if ((byte & PAPER_END_BIT) !== 0) return "paper_out";
  if ((byte & (FEED_BUTTON_BIT | ERROR_BIT)) !== 0) return "not_responding";
  return "ready";
}

function statusesIn(chunk: Uint8Array): PrinterStatus[] {
  return [...chunk]
    .filter((byte) => (byte & STATUS_FIXED_BITS_MASK) === STATUS_FIXED_BITS)
    .map(statusOf);
}

interface Link {
  socket: PrinterSocket;
  address: ReceiptPrinterAddress;
  connected: boolean;
  unansweredPolls: number;
  cancelConnectLimit: () => void;
}

export class TcpReceiptPrinter implements ReceiptPrinter {
  private readonly address: () => ReceiptPrinterAddress | undefined;
  private readonly timers: PrinterTimers;
  private readonly connect: (port: number, host: string) => PrinterSocket;

  constructor(options: TcpReceiptPrinterOptions) {
    this.address = options.address;
    this.timers = options.timers ?? realTimers;
    this.connect = options.connect ?? ((port, host) => createConnection({ port, host }));
  }

  private configuredAddress(): ReceiptPrinterAddress | undefined {
    try {
      return this.address();
    } catch {
      return undefined;
    }
  }

  print(watch: ReceiptPrintWatch, sending: () => Uint8Array): Promise<ReceiptPrintEnding> {
    if (watch.signal.aborted) return Promise.resolve({ kind: "abandoned" });
    return new Promise((resolve, reject) => {
      let link: Link | undefined;
      let lastStatus: PrinterStatus | undefined;
      let finished = false;
      let cancelTick = (): void => {};

      const report = (status: PrinterStatus): void => {
        if (status === lastStatus) return;
        lastStatus = status;
        watch.onStatus(status);
      };

      const dropLink = (): void => {
        if (link === undefined) return;
        link.cancelConnectLimit();
        link.socket.destroy();
        link = undefined;
      };

      const finish = (): void => {
        finished = true;
        cancelTick();
        watch.signal.removeEventListener("abort", abandon);
      };

      const abandon = (): void => {
        finish();
        dropLink();
        resolve({ kind: "abandoned" });
      };

      const send = (ready: Link): void => {
        finish();
        link = undefined;
        let bytes: Uint8Array;
        try {
          bytes = sending();
        } catch (error) {
          ready.socket.destroy();
          reject(error);
          return;
        }
        ready.socket.write(bytes);
        ready.socket.end();
        resolve({ kind: "sent" });
      };

      const lose = (lost: Link): void => {
        lost.cancelConnectLimit();
        if (link !== lost) return;
        dropLink();
        report("not_responding");
      };

      const open = (): void => {
        const target = this.configuredAddress();
        if (target === undefined) {
          report("not_responding");
          return;
        }
        const socket = this.connect(target.port ?? RAW_PRINTING_PORT, target.host);
        const opened: Link = {
          socket,
          address: target,
          connected: false,
          unansweredPolls: 0,
          cancelConnectLimit: this.timers.after(CONNECT_LIMIT_MS, () => lose(opened)),
        };
        link = opened;
        socket.on("connect", () => {
          opened.cancelConnectLimit();
          opened.connected = true;
        });
        socket.on("data", (chunk) => {
          for (const status of statusesIn(chunk)) {
            if (finished || link !== opened) return;
            opened.unansweredPolls = 0;
            report(status);
            if (status === "ready") send(opened);
          }
        });
        socket.on("error", () => lose(opened));
        socket.on("close", () => lose(opened));
      };

      const poll = (): void => {
        cancelTick = this.timers.after(POLL_INTERVAL_MS, poll);
        const wanted = this.configuredAddress();
        if (
          link !== undefined &&
          wanted !== undefined &&
          !reachSameReceiptPrinter(link.address, wanted)
        ) {
          dropLink();
        }
        if (link === undefined) {
          open();
        } else if (link.connected) {
          if (link.unansweredPolls >= UNANSWERED_POLLS_BEFORE_SILENCE) {
            report("not_responding");
          }
          link.unansweredPolls += 1;
          link.socket.write(STATUS_QUERY);
        }
      };

      watch.signal.addEventListener("abort", abandon, { once: true });
      open();
      cancelTick = this.timers.after(POLL_INTERVAL_MS, poll);
    });
  }
}
