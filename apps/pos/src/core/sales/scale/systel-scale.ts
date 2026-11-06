import type { Scale, ScaleReading } from "@purosur/domain/sales/use-cases";
import type { SerialLink } from "../serial-link/open-serial-link.js";

const REQUEST_WEIGHT = 0x05;
const REQUEST_LIVE_WEIGHT = [0x07, 0x07];
const LIVE_STABLE_MARK = 0x65;
const LIVE_UNSTABLE_MARK = 0x69;
const LIVE_MINUS = 0x2d;
const LIVE_FRAME_LENGTH = 8;
const FRAMED_READS_TO_SETTLE = 3;
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

export type LiveWeightAnswer =
  | { kind: "stable"; weightThousandths: number }
  | { kind: "unstable"; weightThousandths: number }
  | { kind: "discarded" };

function liveFrameLength(firstByte: number | undefined): number {
  return firstByte === LIVE_MINUS ? LIVE_FRAME_LENGTH + 1 : LIVE_FRAME_LENGTH;
}

export function decodeLiveWeightAnswer(bytes: Uint8Array): LiveWeightAnswer {
  if (bytes.length !== liveFrameLength(bytes[0])) {
    return { kind: "discarded" };
  }
  const negative = bytes[0] === LIVE_MINUS;
  const digits = bytes.slice(negative ? 1 : 0, bytes.length - 2);
  const mark = bytes[bytes.length - 2];
  const check = bytes.slice(0, -1).reduce((sum, byte) => sum ^ byte, 0);
  if (
    check !== bytes[bytes.length - 1] ||
    (mark !== LIVE_STABLE_MARK && mark !== LIVE_UNSTABLE_MARK) ||
    !digits.every((byte) => byte >= ASCII_ZERO && byte <= ASCII_NINE)
  ) {
    return { kind: "discarded" };
  }
  const magnitude = digits.reduce((weight, byte) => weight * 10 + (byte - ASCII_ZERO), 0);
  return {
    kind: mark === LIVE_STABLE_MARK ? "stable" : "unstable",
    weightThousandths: negative && magnitude !== 0 ? -magnitude : magnitude,
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
  protocol: "undetected" | "live" | "framed";
  framedReads: number;
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
        protocol: "undetected",
        framedReads: 0,
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

  function ask(
    opened: OpenLink,
    request: Uint8Array,
    isComplete: (received: number[]) => boolean,
  ): Promise<Collected> {
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
        if (isComplete(received)) {
          settle(bytesOf(received));
          return;
        }
        cancelQuiet();
        cancelQuiet = timers.after(QUIET_GAP_MS, () => settle(bytesOf(received)));
      };
      try {
        opened.link.write(request);
      } catch {
        settle({ kind: "lost" });
      }
    });
  }

  const askLiveWeight = (opened: OpenLink): Promise<Collected> =>
    ask(
      opened,
      Uint8Array.from(REQUEST_LIVE_WEIGHT),
      (received) => received.length >= liveFrameLength(received[0]),
    );

  const askFramedWeight = (opened: OpenLink): Promise<Collected> =>
    ask(opened, Uint8Array.of(REQUEST_WEIGHT), () => false);

  type Attempted = { reading: ScaleReading; answered: boolean };

  type LiveAttempt =
    | { kind: "read"; reading: ScaleReading }
    | { kind: "lost" | "silent" | "discarded" };

  async function readLive(opened: OpenLink): Promise<LiveAttempt> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const collected = await askLiveWeight(opened);
      if (collected.kind === "lost") {
        drop();
        return { kind: "lost" };
      }
      if (collected.kind === "silent") {
        return { kind: "silent" };
      }
      const answer = decodeLiveWeightAnswer(collected.bytes);
      if (answer.kind !== "discarded") {
        opened.protocol = "live";
        return { kind: "read", reading: answer };
      }
    }
    return { kind: "discarded" };
  }

  async function readFramed(opened: OpenLink): Promise<Attempted> {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const collected = await askFramedWeight(opened);
      if (collected.kind === "lost") {
        drop();
        return { reading: { kind: "unavailable" }, answered: false };
      }
      if (collected.kind === "silent") {
        return { reading: { kind: "unavailable" }, answered: false };
      }
      const answer = decodeScaleAnswer(collected.bytes);
      if (answer.kind === "stable") {
        return {
          reading: { kind: "stable", weightThousandths: answer.weightThousandths },
          answered: true,
        };
      }
      if (answer.kind === "unstable") {
        return { reading: { kind: "not_stable" }, answered: true };
      }
    }
    return { reading: { kind: "not_stable" }, answered: false };
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
    if (opened.protocol === "framed") {
      return (await readFramed(opened)).reading;
    }
    const live = await readLive(opened);
    if (live.kind === "read") {
      return live.reading;
    }
    if (live.kind === "lost") {
      return { kind: "unavailable" };
    }
    if (opened.protocol === "live") {
      return { kind: live.kind === "silent" ? "unavailable" : "not_stable" };
    }
    const framed = await readFramed(opened);
    opened.framedReads = framed.answered ? opened.framedReads + 1 : 0;
    if (opened.framedReads >= FRAMED_READS_TO_SETTLE) {
      opened.protocol = "framed";
    }
    return framed.reading;
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
