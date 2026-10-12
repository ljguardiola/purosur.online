import { randomInt } from "node:crypto";
import { createConnection } from "node:net";
import type {
  ReceiptPrintEnding,
  ReceiptPrinter,
  ReceiptPrintWatch,
} from "@purosur/domain/sales/use-cases";
import { RAW_PRINTING_PORT } from "../register/receipt-printer-endpoint";

type PrinterStatus = Parameters<ReceiptPrintWatch["onStatus"]>[0];

const POLL_INTERVAL_MS = 500;
const CONNECT_LIMIT_MS = 3000;
const UNANSWERED_POLLS_BEFORE_SILENCE = 2;

// DLE EOT 2: real-time transmit of the paper sensor status.
const STATUS_QUERY = Uint8Array.of(0x10, 0x04, 0x02);
// GS ( H: transmit response, answered 0x37 0x22 id 0x00 once the receipt came out.
const TRANSMIT_RESPONSE_HEAD = [0x1d, 0x28, 0x48, 0x06, 0x00, 0x30, 0x30];
// DLE DC4 8: clear the receive and print buffers, answered 0x37 0x25 0x00 once cleared.
const CLEAR_BUFFERS = Uint8Array.of(0x10, 0x14, 0x08, 0x01, 0x03, 0x14, 0x01, 0x06, 0x02, 0x08);
const RESPONSE_MARK = 0x37;
const RESPONSE_MARK_SECOND = 0x22;
const CLEARED_MARK_SECOND = 0x25;
const PRINT_ID_LENGTH = 4;
// A status byte always has bit0=0, bit1=1, bit4=1 and bit7=0.
const STATUS_FIXED_BITS_MASK = 0x93;
const STATUS_FIXED_BITS = 0x12;
const COVER_OPEN_BIT = 0x04;
const PAPER_END_BIT = 0x20;

export interface PrinterSocket {
  on(event: "connect", listener: () => void): unknown;
  on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
  on(event: "error" | "close", listener: () => void): unknown;
  write(data: Uint8Array): unknown;
  destroy(): unknown;
}

export interface PrinterTimers {
  after(delayMs: number, run: () => void): () => void;
}

export interface TcpReceiptPrinterOptions {
  host: string;
  port?: number;
  timers?: PrinterTimers;
  nextPrintId?: () => string;
  connect?: (port: number, host: string) => PrinterSocket;
}

const realTimers: PrinterTimers = {
  after(delayMs, run) {
    const handle = setTimeout(run, delayMs);
    return () => clearTimeout(handle);
  },
};

function randomPrintId(): string {
  let id = "";
  for (let index = 0; index < PRINT_ID_LENGTH; index += 1) {
    id += String.fromCharCode(randomInt(0x30, 0x7b));
  }
  return id;
}

function statusOf(byte: number): PrinterStatus {
  if ((byte & COVER_OPEN_BIT) !== 0) return "cover_open";
  if ((byte & PAPER_END_BIT) !== 0) return "paper_out";
  return "ready";
}

type StreamEvent =
  | { kind: "status"; status: PrinterStatus }
  | { kind: "response"; id: string }
  | { kind: "cleared" };

class PrinterStream {
  private state: "idle" | "mark" | "id" | "end" | "cleared" = "idle";
  private id = "";

  read(chunk: Uint8Array): StreamEvent[] {
    const events: StreamEvent[] = [];
    for (const byte of chunk) this.take(byte, events);
    return events;
  }

  private take(byte: number, events: StreamEvent[]): void {
    switch (this.state) {
      case "idle":
        if ((byte & STATUS_FIXED_BITS_MASK) === STATUS_FIXED_BITS) {
          events.push({ kind: "status", status: statusOf(byte) });
        } else if (byte === RESPONSE_MARK) {
          this.state = "mark";
        }
        return;
      case "mark":
        if (byte === RESPONSE_MARK_SECOND) {
          this.state = "id";
          this.id = "";
        } else if (byte === CLEARED_MARK_SECOND) {
          this.state = "cleared";
        } else {
          this.state = "idle";
          this.take(byte, events);
        }
        return;
      case "id":
        this.id += String.fromCharCode(byte);
        if (this.id.length === PRINT_ID_LENGTH) this.state = "end";
        return;
      case "end":
        this.state = "idle";
        if (byte === 0x00) events.push({ kind: "response", id: this.id });
        else this.take(byte, events);
        return;
      case "cleared":
        this.state = "idle";
        if (byte === 0x00) events.push({ kind: "cleared" });
        else this.take(byte, events);
    }
  }
}

interface Link {
  socket: PrinterSocket;
  stream: PrinterStream;
  connected: boolean;
  carriesReceipt: boolean;
  unansweredPolls: number;
}

export class TcpReceiptPrinter implements ReceiptPrinter {
  private readonly host: string;
  private readonly port: number;
  private readonly timers: PrinterTimers;
  private readonly nextPrintId: () => string;
  private readonly connect: (port: number, host: string) => PrinterSocket;

  constructor(options: TcpReceiptPrinterOptions) {
    this.host = options.host;
    this.port = options.port ?? RAW_PRINTING_PORT;
    this.timers = options.timers ?? realTimers;
    this.nextPrintId = options.nextPrintId ?? randomPrintId;
    this.connect = options.connect ?? ((port, host) => createConnection({ port, host }));
  }

  print(receipt: Uint8Array, watch: ReceiptPrintWatch): Promise<ReceiptPrintEnding> {
    if (watch.signal.aborted) return Promise.resolve({ kind: "abandoned" });
    if (watch.withdrawal.aborted) return Promise.resolve({ kind: "withdrawn" });
    return new Promise((resolve) => {
      const printId = this.nextPrintId();
      let link: Link | undefined;
      let receiptSent = false;
      let lastStatus: PrinterStatus | undefined;
      let finished = false;
      let withdrawing = false;

      const report = (status: PrinterStatus): void => {
        if (status === lastStatus) return;
        lastStatus = status;
        watch.onStatus(status);
      };

      const finish = (ending: ReceiptPrintEnding): void => {
        if (finished) return;
        finished = true;
        cancelTick();
        link?.socket.destroy();
        watch.signal.removeEventListener("abort", abandon);
        watch.withdrawal.removeEventListener("abort", withdraw);
        resolve(ending);
      };

      const abandon = (): void => finish({ kind: "abandoned" });

      const withdraw = (): void => {
        if (finished) return;
        if (!receiptSent) {
          finish({ kind: "withdrawn" });
          return;
        }
        withdrawing = true;
        if (link?.connected) link.socket.write(CLEAR_BUFFERS);
      };

      const lose = (lost: Link, cancelConnectLimit: () => void): void => {
        cancelConnectLimit();
        if (link !== lost) return;
        link = undefined;
        lost.socket.destroy();
        report("not_responding");
      };

      const open = (): void => {
        const socket = this.connect(this.port, this.host);
        const opened: Link = {
          socket,
          stream: new PrinterStream(),
          connected: false,
          carriesReceipt: false,
          unansweredPolls: 0,
        };
        link = opened;
        const cancelConnectLimit = this.timers.after(CONNECT_LIMIT_MS, () =>
          lose(opened, () => {}),
        );
        socket.on("connect", () => {
          cancelConnectLimit();
          if (finished) return;
          opened.connected = true;
          if (receiptSent) {
            if (withdrawing) socket.write(CLEAR_BUFFERS);
            return;
          }
          receiptSent = true;
          opened.carriesReceipt = true;
          socket.write(
            Uint8Array.of(
              ...receipt,
              ...TRANSMIT_RESPONSE_HEAD,
              ...printId.split("").map((character) => character.charCodeAt(0)),
            ),
          );
        });
        socket.on("data", (chunk) => {
          for (const event of opened.stream.read(chunk)) {
            if (finished) return;
            if (event.kind === "status") {
              opened.unansweredPolls = 0;
              report(event.status);
            } else if (event.kind === "cleared") {
              if (withdrawing) finish({ kind: "withdrawn" });
            } else if (opened.carriesReceipt && event.id === printId) {
              finish({ kind: "acknowledged" });
            }
          }
        });
        socket.on("error", () => lose(opened, cancelConnectLimit));
        socket.on("close", () => lose(opened, cancelConnectLimit));
      };

      const poll = (): void => {
        cancelTick = this.timers.after(POLL_INTERVAL_MS, poll);
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

      let cancelTick = (): void => {};
      watch.signal.addEventListener("abort", abandon, { once: true });
      watch.withdrawal.addEventListener("abort", withdraw, { once: true });
      open();
      cancelTick = this.timers.after(POLL_INTERVAL_MS, poll);
    });
  }
}
