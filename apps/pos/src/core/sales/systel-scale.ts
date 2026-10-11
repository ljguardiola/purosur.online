import type { Scale, ScaleReading } from "@purosur/domain/sales/use-cases";
import type { SerialLink } from "./open-serial-link.js";

const REQUEST_WEIGHT = 0x05;
const FRAME_START = 0x02;
const FRAME_END = 0x03;
const FRAME_LENGTH = 9;
const UNSTABLE_ANSWER_LENGTH = 1;
const FIRST_DIGIT = 1;
const END_POSITION = 7;
const DIGIT_COUNT = 6;
const ASCII_ZERO = 0x30;
const ASCII_NINE = 0x39;

const QUIET_GAP_MS = 50;
const ANSWER_LIMIT_MS = 500;
const ATTEMPTS = 3;

export type ScaleAnswer =
  | { kind: "stable"; weightThousandths: number }
  | { kind: "unstable" }
  | { kind: "discarded" };

export function decodeScaleAnswer(bytes: Uint8Array): ScaleAnswer {
  if (bytes.length === UNSTABLE_ANSWER_LENGTH) {
    return { kind: "unstable" };
  }
  if (bytes.length !== FRAME_LENGTH) {
    return { kind: "discarded" };
  }
  // Byte 0 is rebuilt as the XOR of bytes 1..8; the scale's check byte makes it equal for an undamaged frame.
  const rebuiltStart = bytes.slice(1).reduce((check, byte) => check ^ byte, 0);
  const digits = bytes.slice(FIRST_DIGIT, FIRST_DIGIT + DIGIT_COUNT);
  if (
    rebuiltStart !== FRAME_START ||
    bytes[END_POSITION] !== FRAME_END ||
    !digits.every((byte) => byte >= ASCII_ZERO && byte <= ASCII_NINE)
  ) {
    return { kind: "discarded" };
  }
  return {
    kind: "stable",
    weightThousandths: digits.reduce((weight, byte) => weight * 10 + (byte - ASCII_ZERO), 0),
  };
}

interface ScaleTimers {
  after(delayMs: number, run: () => void): () => void;
}

export interface SystelScaleDeps {
  path: () => string | undefined;
  openLink: (path: string) => Promise<SerialLink>;
  timers?: ScaleTimers;
}

const realTimers: ScaleTimers = {
  after(delayMs, run) {
    const handle = setTimeout(run, delayMs);
    return () => clearTimeout(handle);
  },
};

interface OpenLink {
  path: string;
  link: SerialLink;
  lost: boolean;
  listen: ((chunk: Uint8Array) => void) | undefined;
  onLost: (() => void) | undefined;
}

type Collected = { kind: "bytes"; bytes: Uint8Array } | { kind: "silent" } | { kind: "lost" };

export function createSystelScale({ path, openLink, timers = realTimers }: SystelScaleDeps): Scale {
  let open: OpenLink | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  function drop(): void {
    open?.link.close();
    open = undefined;
  }

  async function linkTo(wanted: string): Promise<OpenLink | undefined> {
    if (open !== undefined && (open.lost || open.path !== wanted)) {
      drop();
    }
    if (open !== undefined) {
      return open;
    }
    try {
      const link = await openLink(wanted);
      const opened: OpenLink = {
        path: wanted,
        link,
        lost: false,
        listen: undefined,
        onLost: undefined,
      };
      const lose = (): void => {
        opened.lost = true;
        opened.onLost?.();
      };
      link.on("data", (chunk) => opened.listen?.(chunk));
      link.on("error", lose);
      link.on("close", lose);
      open = opened;
      return opened;
    } catch {
      return undefined;
    }
  }

  function ask(opened: OpenLink): Promise<Collected> {
    return new Promise((resolve) => {
      let received: number[] = [];
      let cancelQuiet = (): void => {};
      let settled = false;

      const settle = (collected: Collected): void => {
        if (settled) return;
        settled = true;
        cancelQuiet();
        cancelLimit();
        opened.listen = undefined;
        opened.onLost = undefined;
        resolve(collected);
      };
      const cancelLimit = timers.after(ANSWER_LIMIT_MS, () =>
        settle(received.length === 0 ? { kind: "silent" } : bytesOf(received)),
      );
      opened.onLost = () => settle({ kind: "lost" });
      opened.listen = (chunk) => {
        received = [...received, ...chunk];
        cancelQuiet();
        cancelQuiet = timers.after(QUIET_GAP_MS, () => settle(bytesOf(received)));
      };
      try {
        opened.link.write(Uint8Array.of(REQUEST_WEIGHT));
      } catch {
        settle({ kind: "lost" });
      }
    });
  }

  async function readOnce(): Promise<ScaleReading> {
    const wanted = path();
    if (wanted === undefined) {
      drop();
      return { kind: "unavailable" };
    }
    const opened = await linkTo(wanted);
    if (opened === undefined) {
      return { kind: "unavailable" };
    }
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const collected = await ask(opened);
      if (collected.kind === "lost") {
        drop();
        return { kind: "unavailable" };
      }
      if (collected.kind === "silent") {
        return { kind: "unavailable" };
      }
      const answer = decodeScaleAnswer(collected.bytes);
      if (answer.kind === "stable") {
        return { kind: "stable", weightThousandths: answer.weightThousandths };
      }
      if (answer.kind === "unstable") {
        return { kind: "not_stable" };
      }
    }
    return { kind: "not_stable" };
  }

  return {
    read() {
      const reading = queue.then(readOnce, readOnce);
      queue = reading;
      return reading;
    },
  };
}

function bytesOf(received: number[]): Collected {
  return { kind: "bytes", bytes: Uint8Array.from(received) };
}
