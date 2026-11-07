import {
  createFrameParser,
  type Frame,
  frame,
  type LabelRaster,
  rowPackets,
  u16,
} from "./label-printer-packets";

export type PrinterLink = {
  write(bytes: Uint8Array): Promise<void>;
  read(): Promise<Uint8Array | null>;
};

export type LabelToPrint = { raster: LabelRaster; copies: number };

export type SequenceOutcome =
  | { kind: "printed"; printed: number }
  | { kind: "interrupted"; printed: number; total: number };

const CONNECT_PREFIX = 0x03;
const ANSWER_TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 300;
const NO_PROGRESS_TIMEOUT_MS = 30_000;
const LABEL_TYPE = 1;
const DENSITY = 4;
const PRINTER_ANSWER_STATUS = 0xb3;

class JobStopped extends Error {}

type Inbox = {
  next(cmd: number, timeoutMs: number): Promise<Frame>;
  discard(cmd: number): void;
};

function startInbox(link: PrinterLink): Inbox {
  const parse = createFrameParser();
  const queue: Frame[] = [];
  let closed = false;
  let wake: (() => void) | null = null;

  function notify() {
    const resolve = wake;
    wake = null;
    resolve?.();
  }

  async function pump() {
    try {
      for (;;) {
        const chunk = await link.read();
        if (chunk === null) {
          break;
        }
        queue.push(...parse(chunk));
        notify();
      }
    } catch {}
    closed = true;
    notify();
  }
  void pump();

  return {
    async next(cmd, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const index = queue.findIndex((queued) => queued.cmd === cmd);
        if (index !== -1) {
          const found = queue.splice(0, index + 1).at(-1);
          if (found) {
            return found;
          }
        }
        if (closed) {
          throw new JobStopped();
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new JobStopped();
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, remaining);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    },
    discard(cmd) {
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (queue[index]?.cmd === cmd) {
          queue.splice(index, 1);
        }
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPrintSequence(
  link: PrinterLink,
  labels: readonly LabelToPrint[],
): Promise<SequenceOutcome> {
  const total = labels.reduce((sum, label) => sum + label.copies, 0);
  const inbox = startInbox(link);
  let printed = 0;

  async function send(cmd: number, data: ArrayLike<number>, prefix: number[] = []) {
    try {
      await link.write(Uint8Array.of(...prefix, ...frame(cmd, data)));
    } catch {
      throw new JobStopped();
    }
  }

  async function request(cmd: number, data: ArrayLike<number>, answer: number, prefix?: number[]) {
    await send(cmd, data, prefix);
    return inbox.next(answer, ANSWER_TIMEOUT_MS);
  }

  async function waitForPages(target: number) {
    let lastProgress = Date.now();
    for (;;) {
      inbox.discard(PRINTER_ANSWER_STATUS);
      const status = await request(0xa3, [1], PRINTER_ANSWER_STATUS);
      const reported = ((status.data[0] ?? 0) << 8) | (status.data[1] ?? 0);
      if (reported > printed) {
        printed = reported;
        lastProgress = Date.now();
      }
      if (printed >= target) {
        return;
      }
      if (Date.now() - lastProgress >= NO_PROGRESS_TIMEOUT_MS) {
        throw new JobStopped();
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  try {
    await request(0xc1, [1], 0xc2, [CONNECT_PREFIX]);
    await request(0x23, [LABEL_TYPE], 0x33);
    await request(0x21, [DENSITY], 0x31);
    await request(0x01, [...u16(total), 0, 0, 0, 0, 0, 0, 0], 0x02);
    await send(0xa3, [1]);
    let expected = 0;
    for (const label of labels) {
      expected += label.copies;
      const { raster } = label;
      await request(
        0x13,
        [
          ...u16(raster.heightRows),
          ...u16(raster.widthDots),
          ...u16(label.copies),
          ...u16(0),
          0,
          0,
          0,
          ...u16(0),
        ],
        0x14,
      );
      for (const packet of rowPackets(raster)) {
        try {
          await link.write(packet);
        } catch {
          throw new JobStopped();
        }
      }
      await request(0xe3, [1], 0xe4);
      await waitForPages(expected);
    }
    await request(0xf3, [1], 0xf4);
    await send(0xdc, [1]);
    return { kind: "printed", printed };
  } catch (error) {
    if (error instanceof JobStopped) {
      return printed >= total
        ? { kind: "printed", printed }
        : { kind: "interrupted", printed, total };
    }
    throw error;
  }
}
