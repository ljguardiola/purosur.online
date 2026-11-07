import { createFrameParser, type Frame, frame, u16 } from "../label-printer-packets";
import type { PrinterLink } from "../label-printer-print-sequence";

export type FakePrinterOptions = {
  silentOn?: number;
  stopProgressAt?: number;
  disconnectOn?: number;
  disconnectOccurrence?: number;
  pollsBeforeProgress?: number;
  noiseBeforeAnswers?: boolean;
};

const ANSWERS = new Map<number, number>([
  [0xc1, 0xc2],
  [0x23, 0x33],
  [0x21, 0x31],
  [0x01, 0x02],
  [0x13, 0x14],
  [0xe3, 0xe4],
  [0xf3, 0xf4],
]);

export function createFakePrinter(options: FakePrinterOptions = {}) {
  const parse = createFrameParser();
  const received: Frame[] = [];
  const writes: Uint8Array[] = [];
  const inbox: Uint8Array[] = [];
  let waiting: ((chunk: Uint8Array | null) => void) | null = null;
  let ended = false;
  let printed = 0;
  let reported = 0;
  let pageCopies = 0;
  let pollsSincePageEnd = 0;
  const seen = new Map<number, number>();

  function deliver(bytes: Uint8Array) {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(bytes);
    } else {
      inbox.push(bytes);
    }
  }

  function end() {
    ended = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  }

  function answer(cmd: number) {
    const answerCmd = ANSWERS.get(cmd);
    if (cmd === 0x13) {
      pageCopies = ((received.at(-1)?.data[4] ?? 0) << 8) | (received.at(-1)?.data[5] ?? 0);
    }
    if (cmd === 0xe3) {
      printed = Math.min(printed + pageCopies, options.stopProgressAt ?? Number.POSITIVE_INFINITY);
      pollsSincePageEnd = 0;
    }
    if (cmd === 0xa3) {
      pollsSincePageEnd += 1;
      if (pollsSincePageEnd > (options.pollsBeforeProgress ?? 0)) {
        reported = printed;
      }
      deliver(frame(0xb3, [...u16(reported), 0, 0]));
      return;
    }
    if (answerCmd !== undefined) {
      deliver(frame(answerCmd, [1]));
    }
  }

  function handle(incoming: Frame) {
    received.push(incoming);
    const count = (seen.get(incoming.cmd) ?? 0) + 1;
    seen.set(incoming.cmd, count);
    if (incoming.cmd === options.disconnectOn && count === (options.disconnectOccurrence ?? 1)) {
      end();
      return;
    }
    if (incoming.cmd === options.silentOn) {
      return;
    }
    if (options.noiseBeforeAnswers) {
      deliver(frame(0x99, [7]));
    }
    answer(incoming.cmd);
  }

  const link: PrinterLink = {
    write: async (bytes) => {
      writes.push(bytes.slice());
      for (const incoming of parse(bytes)) {
        handle(incoming);
      }
    },
    read: () => {
      const next = inbox.shift();
      if (next) {
        return Promise.resolve(next);
      }
      if (ended) {
        return Promise.resolve(null);
      }
      return new Promise((resolve) => {
        waiting = resolve;
      });
    },
  };

  return {
    link,
    received,
    writes,
    commands: () => received.map((incoming) => incoming.cmd),
  };
}

export type FakeSerialPortOptions = { openError?: Error };

export function createFakeSerialPort(
  printer: ReturnType<typeof createFakePrinter>,
  options: FakeSerialPortOptions = {},
) {
  const state = { openedWith: null as { baudRate: number } | null, closed: false };
  return {
    state,
    port: {
      open: async (openOptions: { baudRate: number }) => {
        if (options.openError) {
          throw options.openError;
        }
        state.openedWith = openOptions;
      },
      close: async () => {
        state.closed = true;
      },
      readable: new ReadableStream<Uint8Array>({
        pull: async (controller) => {
          const chunk = await printer.link.read();
          if (chunk === null) {
            controller.close();
          } else {
            controller.enqueue(chunk);
          }
        },
      }),
      writable: new WritableStream<Uint8Array>({
        write: (chunk) => printer.link.write(chunk),
      }),
    },
  };
}
