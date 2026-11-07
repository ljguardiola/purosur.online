import type { Scale } from "@purosur/domain/sales/use-cases";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { ManualTimers } from "../test-support/manual-timers.js";
import { ScriptedSerialLink } from "../test-support/scripted-serial-link.js";
import { createSystelScale, decodeLiveWeightAnswer, decodeScaleAnswer } from "./systel-scale.js";

const REQUEST = 0x05;
const LIVE_REQUEST = [0x07, 0x07];
const STABLE_MARK = 0x65;
const UNSTABLE_MARK = 0x69;
const MINUS = 0x2d;
const QUIET_GAP_MS = 50;
const ANSWER_LIMIT_MS = 500;
const UNSTABLE = 0x11;

const digitCode = fc.integer({ min: 0x30, max: 0x39 });
const sixDigits = fc.array(digitCode, { minLength: 6, maxLength: 6 });
const anyByte = fc.integer({ min: 0, max: 255 });

function frameOf(digits: number[]): number[] {
  const body = [0x02, ...digits, 0x03];
  return [...body, body.reduce((check, byte) => check ^ byte, 0)];
}

function frameFor(grams: number): number[] {
  return frameOf([...String(grams).padStart(6, "0")].map((digit) => digit.charCodeAt(0)));
}

function liveFrameOf(digits: number[], mark: number, negative = false): number[] {
  const body = [...(negative ? [MINUS] : []), ...digits, mark];
  return [...body, body.reduce((check, byte) => check ^ byte, 0)];
}

function liveFrame(grams: number, mark: number, negative = false): number[] {
  const digits = [...String(grams).padStart(6, "0")].map((digit) => digit.charCodeAt(0));
  return liveFrameOf(digits, mark, negative);
}

function weightOf(digits: number[]): number {
  return Number(String.fromCharCode(...digits));
}

describe("decodeScaleAnswer", () => {
  it("reads the example frame of 710 grams", () => {
    expect(
      decodeScaleAnswer(Uint8Array.of(0x02, 0x30, 0x30, 0x30, 0x37, 0x31, 0x30, 0x03, 0x07)),
    ).toEqual({ kind: "stable", weightThousandths: 710 });
  });

  it("takes the weight a valid frame carries", () => {
    fc.assert(
      fc.property(sixDigits, (digits) => {
        expect(decodeScaleAnswer(Uint8Array.from(frameOf(digits)))).toEqual({
          kind: "stable",
          weightThousandths: weightOf(digits),
        });
      }),
    );
  });

  it("rebuilds a frame whose only damage is the first byte", () => {
    fc.assert(
      fc.property(sixDigits, anyByte, (digits, first) => {
        const damaged = [first, ...frameOf(digits).slice(1)];

        expect(decodeScaleAnswer(Uint8Array.from(damaged))).toEqual({
          kind: "stable",
          weightThousandths: weightOf(digits),
        });
      }),
    );
  });

  it("discards a frame whose rebuilt start is not the fixed frame start", () => {
    fc.assert(
      fc.property(sixDigits, anyByte, fc.integer({ min: 1, max: 255 }), (digits, first, damage) => {
        const frame = frameOf(digits);
        const check = (frame[8] as number) ^ damage;

        expect(decodeScaleAnswer(Uint8Array.from([first, ...frame.slice(1, 8), check]))).toEqual({
          kind: "discarded",
        });
      }),
    );
  });

  it("discards a frame whose end is not the fixed frame end, even when its check byte is consistent", () => {
    fc.assert(
      fc.property(
        sixDigits,
        anyByte.filter((byte) => byte !== 0x03),
        (digits, end) => {
          const body = [0x02, ...digits, end];
          const frame = [...body, body.reduce((check, byte) => check ^ byte, 0)];

          expect(decodeScaleAnswer(Uint8Array.from(frame))).toEqual({ kind: "discarded" });
        },
      ),
    );
  });

  it("discards a frame carrying a byte that is not a digit where the weight goes", () => {
    fc.assert(
      fc.property(
        sixDigits,
        fc.integer({ min: 0, max: 5 }),
        anyByte.filter((byte) => byte < 0x30 || byte > 0x39),
        (digits, position, notDigit) => {
          const damaged = digits.map((digit, index) => (index === position ? notDigit : digit));

          expect(decodeScaleAnswer(Uint8Array.from(frameOf(damaged)))).toEqual({
            kind: "discarded",
          });
        },
      ),
    );
  });

  it("never takes a negative weight", () => {
    fc.assert(
      fc.property(sixDigits, (digits) => {
        const body = [0x02, 0x2d, ...digits, 0x03];
        const frame = [...body, body.reduce((check, byte) => check ^ byte, 0)];

        expect(decodeScaleAnswer(Uint8Array.from(frame)).kind).not.toBe("stable");
      }),
    );
  });

  it("takes any single byte as an unstable reading, even a damaged one", () => {
    fc.assert(
      fc.property(anyByte, (byte) => {
        expect(decodeScaleAnswer(Uint8Array.of(byte))).toEqual({ kind: "unstable" });
      }),
    );
  });

  it("discards every answer that is neither one nor nine bytes long", () => {
    fc.assert(
      fc.property(
        fc
          .uint8Array({ maxLength: 20 })
          .filter((bytes) => bytes.length !== 1 && bytes.length !== 9),
        (bytes) => {
          expect(decodeScaleAnswer(bytes)).toEqual({ kind: "discarded" });
        },
      ),
    );
  });

  it("never yields a weight the answer does not carry", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 12 }), (bytes) => {
        const answer = decodeScaleAnswer(bytes);
        if (answer.kind !== "stable") return;

        const digits = [...bytes.slice(1, 7)];
        expect(bytes).toHaveLength(9);
        expect(digits.every((byte) => byte >= 0x30 && byte <= 0x39)).toBe(true);
        expect(bytes[7]).toBe(0x03);
        expect(bytes.slice(1).reduce((check, byte) => check ^ byte, 0)).toBe(0x02);
        expect(answer.weightThousandths).toBe(weightOf(digits));
      }),
    );
  });
});

describe("decodeLiveWeightAnswer", () => {
  it("reads the example stable frame of 120 grams", () => {
    expect(
      decodeLiveWeightAnswer(Uint8Array.of(0x30, 0x30, 0x30, 0x31, 0x32, 0x30, 0x65, 0x66)),
    ).toEqual({ kind: "stable", weightThousandths: 120 });
  });

  it("reads the example unstable frame of 185 grams", () => {
    expect(
      decodeLiveWeightAnswer(Uint8Array.of(0x30, 0x30, 0x30, 0x31, 0x38, 0x35, 0x69, 0x65)),
    ).toEqual({ kind: "unstable", weightThousandths: 185 });
  });

  it("takes the weight and the stability a valid frame carries", () => {
    fc.assert(
      fc.property(
        sixDigits,
        fc.constantFrom(STABLE_MARK, UNSTABLE_MARK),
        fc.boolean(),
        (digits, mark, negative) => {
          const magnitude = weightOf(digits);

          expect(
            decodeLiveWeightAnswer(Uint8Array.from(liveFrameOf(digits, mark, negative))),
          ).toEqual({
            kind: mark === STABLE_MARK ? "stable" : "unstable",
            weightThousandths: negative && magnitude !== 0 ? -magnitude : magnitude,
          });
        },
      ),
    );
  });

  it("discards a frame whose check byte does not match", () => {
    fc.assert(
      fc.property(
        sixDigits,
        fc.constantFrom(STABLE_MARK, UNSTABLE_MARK),
        fc.boolean(),
        fc.integer({ min: 1, max: 255 }),
        (digits, mark, negative, damage) => {
          const frame = liveFrameOf(digits, mark, negative);
          frame[frame.length - 1] = (frame[frame.length - 1] as number) ^ damage;

          expect(decodeLiveWeightAnswer(Uint8Array.from(frame))).toEqual({ kind: "discarded" });
        },
      ),
    );
  });

  it("discards a frame whose stability mark is neither e nor i, even when its check byte is consistent", () => {
    fc.assert(
      fc.property(
        sixDigits,
        anyByte.filter((byte) => byte !== STABLE_MARK && byte !== UNSTABLE_MARK),
        (digits, mark) => {
          expect(decodeLiveWeightAnswer(Uint8Array.from(liveFrameOf(digits, mark)))).toEqual({
            kind: "discarded",
          });
        },
      ),
    );
  });

  it("discards a frame carrying a byte that is not a digit where the weight goes, even when its check byte is consistent", () => {
    fc.assert(
      fc.property(
        sixDigits,
        fc.integer({ min: 0, max: 5 }),
        anyByte.filter((byte) => byte < 0x30 || byte > 0x39),
        fc.boolean(),
        (digits, position, notDigit, negative) => {
          const damaged = digits.map((digit, index) => (index === position ? notDigit : digit));

          expect(
            decodeLiveWeightAnswer(Uint8Array.from(liveFrameOf(damaged, STABLE_MARK, negative))),
          ).toEqual({ kind: "discarded" });
        },
      ),
    );
  });

  it("discards a frame whose first byte is damaged, as the check byte no longer matches", () => {
    fc.assert(
      fc.property(
        sixDigits,
        fc.constantFrom(STABLE_MARK, UNSTABLE_MARK),
        fc.constantFrom(0xb0, 0x70, 0xb8),
        (digits, mark, first) => {
          const frame = liveFrameOf(digits, mark);

          expect(decodeLiveWeightAnswer(Uint8Array.from([first, ...frame.slice(1)]))).toEqual({
            kind: "discarded",
          });
        },
      ),
    );
  });

  it("discards every answer whose length is not the one its first byte announces", () => {
    fc.assert(
      fc.property(
        sixDigits,
        fc.constantFrom(STABLE_MARK, UNSTABLE_MARK),
        fc.boolean(),
        fc.constantFrom(-1, 1),
        (digits, mark, negative, difference) => {
          const frame = liveFrameOf(digits, mark, negative);
          const resized = difference < 0 ? frame.slice(0, -1) : [...frame, 0];

          expect(decodeLiveWeightAnswer(Uint8Array.from(resized))).toEqual({ kind: "discarded" });
        },
      ),
    );
  });

  it("discards an empty answer", () => {
    expect(decodeLiveWeightAnswer(new Uint8Array())).toEqual({ kind: "discarded" });
  });

  it("never yields a weight the answer does not carry", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 12 }), (bytes) => {
        const answer = decodeLiveWeightAnswer(bytes);
        if (answer.kind === "discarded") return;

        const negative = bytes[0] === MINUS;
        const digits = [...bytes.slice(negative ? 1 : 0, negative ? 7 : 6)];
        expect(bytes).toHaveLength(negative ? 9 : 8);
        expect(digits.every((byte) => byte >= 0x30 && byte <= 0x39)).toBe(true);
        expect(bytes.slice(0, -1).reduce((check, byte) => check ^ byte, 0)).toBe(bytes.at(-1));
        expect(Math.abs(answer.weightThousandths)).toBe(weightOf(digits));
      }),
    );
  });
});

async function nextIoTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("createSystelScale", () => {
  let timers: ManualTimers;
  let links: ScriptedSerialLink[];
  let opened: string[];
  let path: string | undefined;
  let openFails: boolean;

  function scale() {
    return createSystelScale({
      path: () => path,
      openLink: async (linkPath) => {
        opened.push(linkPath);
        if (openFails) throw new Error("cannot open");
        const link = new ScriptedSerialLink();
        links.push(link);
        return link;
      },
      timers,
    });
  }

  async function answer(link: ScriptedSerialLink, ...bytes: number[]): Promise<void> {
    link.receive(...bytes);
    timers.fire(QUIET_GAP_MS);
    await nextIoTurn();
  }

  async function answerLive(link: ScriptedSerialLink, ...bytes: number[]): Promise<void> {
    link.receive(...bytes);
    await nextIoTurn();
  }

  async function silenceOnLiveRequest(): Promise<void> {
    timers.fire(ANSWER_LIMIT_MS);
    await nextIoTurn();
  }

  async function startReading(connected: Scale, link = 0) {
    const reading = connected.read();
    await nextIoTurn();
    return { reading, link: links[link] as ScriptedSerialLink };
  }

  async function protocolAScale(): Promise<Scale> {
    const connected = scale();
    for (let detectingRead = 0; detectingRead < 3; detectingRead += 1) {
      const { reading, link } = await startReading(connected);
      await silenceOnLiveRequest();
      await answer(link, ...frameFor(100));
      await reading;
    }
    (links[0] as ScriptedSerialLink).written.length = 0;
    return connected;
  }

  async function liveScale(): Promise<Scale> {
    const connected = scale();
    const { reading, link } = await startReading(connected);
    await answerLive(link, ...liveFrame(100, STABLE_MARK));
    await reading;
    link.written.length = 0;
    return connected;
  }

  beforeEach(() => {
    timers = new ManualTimers();
    links = [];
    opened = [];
    path = "/dev/ttyUSB0";
    openFails = false;
  });

  describe("on a scale answering protocol B", () => {
    it("asks the live weight with its request and answers a stable weight", async () => {
      const { reading, link } = await startReading(scale());

      expect(link.written).toEqual([LIVE_REQUEST]);
      await answerLive(link, ...liveFrame(120, STABLE_MARK));
      expect(await reading).toEqual({ kind: "stable", weightThousandths: 120 });
    });

    it("answers the weight of an unstable frame as unstable", async () => {
      const { reading, link } = await startReading(scale());

      await answerLive(link, ...liveFrame(185, UNSTABLE_MARK));

      expect(await reading).toEqual({ kind: "unstable", weightThousandths: 185 });
    });

    it("answers a negative weight as a negative reading, complete at nine bytes", async () => {
      const { reading, link } = await startReading(scale());

      await answerLive(link, ...liveFrame(40, STABLE_MARK, true));

      expect(await reading).toEqual({ kind: "stable", weightThousandths: -40 });
    });

    it("completes an answer when its eight bytes have arrived, without waiting for the quiet gap", async () => {
      const { reading, link } = await startReading(scale());
      const frame = liveFrame(120, STABLE_MARK);

      link.receive(...frame.slice(0, 5));
      link.receive(...frame.slice(5));

      expect(await reading).toEqual({ kind: "stable", weightThousandths: 120 });
      expect(timers.pending(QUIET_GAP_MS)).toBe(0);
    });

    it("keeps collecting a negative frame past eight bytes", async () => {
      const { reading, link } = await startReading(scale());
      const frame = liveFrame(40, UNSTABLE_MARK, true);

      link.receive(...frame.slice(0, 8));
      await nextIoTurn();
      expect(timers.pending(ANSWER_LIMIT_MS)).toBe(1);
      link.receive(...frame.slice(8));

      expect(await reading).toEqual({ kind: "unstable", weightThousandths: -40 });
    });

    it("waits for the quiet gap when the answer is shorter than its frame", async () => {
      const { reading, link } = await startReading(scale());

      link.receive(0x30, 0x30, 0x30);
      await nextIoTurn();
      expect(timers.pending(QUIET_GAP_MS)).toBe(1);
      expect(link.written).toEqual([LIVE_REQUEST]);
      timers.fire(QUIET_GAP_MS);
      await nextIoTurn();

      expect(link.written).toEqual([LIVE_REQUEST, LIVE_REQUEST]);
      await answerLive(link, ...liveFrame(120, STABLE_MARK));
      expect(await reading).toEqual({ kind: "stable", weightThousandths: 120 });
    });

    it.each([
      ["a damaged first byte", (frame: number[]) => [0xb0, ...frame.slice(1)]],
      ["a check byte that does not match", (frame: number[]) => [...frame.slice(0, -1), 0x00]],
      ["a garbled frame", (frame: number[]) => frame.map((byte) => byte ^ 0xff)],
    ])("discards %s and asks again within the same reading", async (_case, damage) => {
      const { reading, link } = await startReading(scale());

      await answerLive(link, ...damage(liveFrame(120, STABLE_MARK)));
      expect(link.written).toEqual([LIVE_REQUEST, LIVE_REQUEST]);
      await answerLive(link, ...liveFrame(130, STABLE_MARK));

      expect(await reading).toEqual({ kind: "stable", weightThousandths: 130 });
    });

    it("answers not stable after three discarded answers", async () => {
      const { reading, link } = await startReading(await liveScale());

      await answerLive(link, ...[0xb0, ...liveFrame(120, STABLE_MARK).slice(1)]);
      await answerLive(link, ...[0xb0, ...liveFrame(120, STABLE_MARK).slice(1)]);
      await answerLive(link, ...[0xb0, ...liveFrame(120, STABLE_MARK).slice(1)]);

      expect(await reading).toEqual({ kind: "not_stable" });
      expect(link.written).toEqual([LIVE_REQUEST, LIVE_REQUEST, LIVE_REQUEST]);
    });

    it("answers unavailable when the scale, known to answer protocol B, goes silent", async () => {
      const { reading, link } = await startReading(await liveScale());

      await silenceOnLiveRequest();

      expect(await reading).toEqual({ kind: "unavailable" });
      expect(link.written).toEqual([LIVE_REQUEST]);
    });

    it("keeps asking protocol B after one valid frame, whatever damage follows", async () => {
      const connected = await liveScale();
      const link = links[0] as ScriptedSerialLink;

      for (let damagedRead = 0; damagedRead < 4; damagedRead += 1) {
        const damaged = connected.read();
        await nextIoTurn();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await answerLive(link, ...[0xb0, ...liveFrame(120, STABLE_MARK).slice(1)]);
        }
        expect(await damaged).toEqual({ kind: "not_stable" });
      }

      expect(link.written.every((request) => request.join() === LIVE_REQUEST.join())).toBe(true);
    });

    it("fixes protocol B on a valid frame even after two readings that fell back to protocol A", async () => {
      const connected = scale();
      for (let fallbackRead = 0; fallbackRead < 2; fallbackRead += 1) {
        const { reading, link } = await startReading(connected);
        await silenceOnLiveRequest();
        await answer(link, ...frameFor(100));
        await reading;
      }
      const { reading, link } = await startReading(connected);
      await answerLive(link, ...liveFrame(120, STABLE_MARK));
      await reading;
      link.written.length = 0;

      const next = connected.read();
      await nextIoTurn();
      await answerLive(link, ...liveFrame(130, STABLE_MARK));

      expect(await next).toEqual({ kind: "stable", weightThousandths: 130 });
      expect(link.written).toEqual([LIVE_REQUEST]);
    });
  });

  describe("on a scale answering protocol A only", () => {
    it("falls back to protocol A in the same reading when protocol B is not answered", async () => {
      const { reading, link } = await startReading(scale());
      expect(link.written).toEqual([LIVE_REQUEST]);

      await silenceOnLiveRequest();
      expect(link.written).toEqual([LIVE_REQUEST, [REQUEST]]);
      await answer(link, ...frameFor(710));

      expect(await reading).toEqual({ kind: "stable", weightThousandths: 710 });
    });

    it("falls back to protocol A in the same reading when protocol B is answered with damaged frames", async () => {
      const { reading, link } = await startReading(scale());

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await answerLive(link, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08);
      }
      expect(link.written).toEqual([LIVE_REQUEST, LIVE_REQUEST, LIVE_REQUEST, [REQUEST]]);
      await answer(link, ...frameFor(710));

      expect(await reading).toEqual({ kind: "stable", weightThousandths: 710 });
    });

    it("asks only protocol A once three readings in a row found no valid protocol B frame and a valid protocol A answer", async () => {
      const connected = await protocolAScale();
      const link = links[0] as ScriptedSerialLink;

      const reading = connected.read();
      await nextIoTurn();

      expect(link.written).toEqual([[REQUEST]]);
      await answer(link, ...frameFor(200));
      expect(await reading).toEqual({ kind: "stable", weightThousandths: 200 });
    });

    it("keeps trying protocol B first before three such readings", async () => {
      const connected = scale();
      for (let fallbackRead = 0; fallbackRead < 2; fallbackRead += 1) {
        const { reading, link } = await startReading(connected);
        await silenceOnLiveRequest();
        await answer(link, ...frameFor(100));
        await reading;
      }
      const link = links[0] as ScriptedSerialLink;
      link.written.length = 0;

      const third = connected.read();
      await nextIoTurn();

      expect(link.written).toEqual([LIVE_REQUEST]);
      await silenceOnLiveRequest();
      await answer(link, ...frameFor(100));
      await third;
    });

    it("does not count a reading in which protocol A was not answered validly", async () => {
      const connected = scale();
      for (const validA of [true, true, false, true]) {
        const { reading, link } = await startReading(connected);
        await silenceOnLiveRequest();
        if (validA) {
          await answer(link, ...frameFor(100));
        } else {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            await answer(link, 0x01, 0x02);
          }
        }
        await reading;
      }
      const link = links[0] as ScriptedSerialLink;
      link.written.length = 0;

      const next = connected.read();
      await nextIoTurn();

      expect(link.written).toEqual([LIVE_REQUEST]);
      await silenceOnLiveRequest();
      await answer(link, ...frameFor(100));
      await next;
    });

    it("asks protocol B first again on a new link, even after settling on protocol A", async () => {
      const connected = await protocolAScale();
      (links[0] as ScriptedSerialLink).fail();

      const { reading, link } = await startReading(connected, 1);

      expect(link.written).toEqual([LIVE_REQUEST]);
      await silenceOnLiveRequest();
      await answer(link, ...frameFor(100));
      await reading;
    });

    it("asks protocol B first again when the scale shows up at another path", async () => {
      const connected = await protocolAScale();
      path = "/dev/ttyUSB1";

      const { reading, link } = await startReading(connected, 1);

      expect(link.written).toEqual([LIVE_REQUEST]);
      await silenceOnLiveRequest();
      await answer(link, ...frameFor(100));
      await reading;
    });

    it("asks with the request byte and answers the stable weight", async () => {
      const { reading, link } = await startReading(await protocolAScale());

      expect(link.written).toEqual([[REQUEST]]);
      await answer(link, ...frameFor(710));
      expect(await reading).toEqual({ kind: "stable", weightThousandths: 710 });
    });

    it("answers not stable when the plate is moving", async () => {
      const { reading, link } = await startReading(await protocolAScale());

      await answer(link, UNSTABLE);

      expect(await reading).toEqual({ kind: "not_stable" });
    });

    it("collects a frame that arrives in pieces before the quiet gap", async () => {
      const { reading, link } = await startReading(await protocolAScale());
      const frame = frameFor(1250);

      link.receive(...frame.slice(0, 4));
      link.receive(...frame.slice(4));
      timers.fire(QUIET_GAP_MS);

      expect(await reading).toEqual({ kind: "stable", weightThousandths: 1250 });
    });

    it("asks again right away after a discarded frame and takes the next good one", async () => {
      const { reading, link } = await startReading(await protocolAScale());

      await answer(link, 0x02, 0x30, 0x30);
      expect(link.written).toEqual([[REQUEST], [REQUEST]]);
      await answer(link, ...frameFor(500));

      expect(await reading).toEqual({ kind: "stable", weightThousandths: 500 });
    });

    it("answers not stable after three discarded answers", async () => {
      const { reading, link } = await startReading(await protocolAScale());

      await answer(link, 0x01, 0x02);
      await answer(link, 0x01, 0x02);
      await answer(link, 0x01, 0x02);

      expect(await reading).toEqual({ kind: "not_stable" });
      expect(link.written).toEqual([[REQUEST], [REQUEST], [REQUEST]]);
    });

    it("answers unavailable when the scale answers nothing within the limit", async () => {
      const { reading } = await startReading(await protocolAScale());

      timers.fire(ANSWER_LIMIT_MS);

      expect(await reading).toEqual({ kind: "unavailable" });
    });

    it("stops collecting at the limit when the scale never goes quiet", async () => {
      const { reading, link } = await startReading(await protocolAScale());

      link.receive(UNSTABLE);
      timers.fire(ANSWER_LIMIT_MS);

      expect(await reading).toEqual({ kind: "not_stable" });
    });
  });

  it("answers unavailable after protocol B and protocol A both stay silent", async () => {
    const { reading, link } = await startReading(scale());

    await silenceOnLiveRequest();
    expect(link.written).toEqual([LIVE_REQUEST, [REQUEST]]);
    await silenceOnLiveRequest();

    expect(await reading).toEqual({ kind: "unavailable" });
  });

  it("answers unavailable without opening anything when no scale is connected", async () => {
    path = undefined;

    expect(await scale().read()).toEqual({ kind: "unavailable" });
    expect(opened).toEqual([]);
  });

  it("answers unavailable when the port cannot be opened, and tries again on the next read", async () => {
    const connected = scale();
    openFails = true;
    expect(await connected.read()).toEqual({ kind: "unavailable" });

    openFails = false;
    const { reading, link } = await startReading(connected);
    await answerLive(link, ...liveFrame(100, STABLE_MARK));

    expect(await reading).toEqual({ kind: "stable", weightThousandths: 100 });
  });

  it("keeps the port open between readings", async () => {
    const connected = scale();
    const first = await startReading(connected);
    await answerLive(first.link, ...liveFrame(100, UNSTABLE_MARK));
    await first.reading;

    const second = await startReading(connected);
    await answerLive(second.link, ...liveFrame(100, UNSTABLE_MARK));
    await second.reading;

    expect(opened).toEqual(["/dev/ttyUSB0"]);
    expect(links[0]?.written).toEqual([LIVE_REQUEST, LIVE_REQUEST]);
  });

  it("reopens the port when the scale shows up at another path, closing the old one", async () => {
    const connected = await liveScale();

    path = "/dev/ttyUSB1";
    const { reading, link } = await startReading(connected, 1);
    await answerLive(link, ...liveFrame(100, UNSTABLE_MARK));
    await reading;

    expect(opened).toEqual(["/dev/ttyUSB0", "/dev/ttyUSB1"]);
    expect(links[0]?.closed).toBe(true);
  });

  it("closes the port when the scale is no longer connected", async () => {
    const connected = await liveScale();

    path = undefined;

    expect(await connected.read()).toEqual({ kind: "unavailable" });
    expect(links[0]?.closed).toBe(true);
  });

  it("answers unavailable when the link fails mid-reading, and reopens on the next read", async () => {
    const connected = scale();
    const failing = connected.read();
    await nextIoTurn();

    (links[0] as ScriptedSerialLink).fail();
    expect(await failing).toEqual({ kind: "unavailable" });

    const { reading, link } = await startReading(connected, 1);
    await answerLive(link, ...liveFrame(100, UNSTABLE_MARK));
    expect(await reading).toEqual({ kind: "unstable", weightThousandths: 100 });
    expect(links[0]?.closed).toBe(true);
  });

  it("reopens the port after a link failure between readings", async () => {
    const connected = await liveScale();
    (links[0] as ScriptedSerialLink).fail();

    const { reading, link } = await startReading(connected, 1);
    await answerLive(link, ...liveFrame(100, UNSTABLE_MARK));

    expect(await reading).toEqual({ kind: "unstable", weightThousandths: 100 });
    expect(opened).toHaveLength(2);
  });

  it("serves concurrent readings one after the other over the same link", async () => {
    const connected = scale();
    const first = connected.read();
    const second = connected.read();
    await nextIoTurn();
    const link = links[0] as ScriptedSerialLink;
    expect(link.written).toEqual([LIVE_REQUEST]);

    await answerLive(link, ...liveFrame(100, STABLE_MARK));
    expect(await first).toEqual({ kind: "stable", weightThousandths: 100 });
    await nextIoTurn();
    expect(link.written).toEqual([LIVE_REQUEST, LIVE_REQUEST]);
    await answerLive(link, ...liveFrame(200, STABLE_MARK));

    expect(await second).toEqual({ kind: "stable", weightThousandths: 200 });
    expect(opened).toHaveLength(1);
  });
});
