import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { createSystelScale, decodeScaleAnswer } from "./systel-scale.js";
import { ManualTimers } from "./test-support/manual-timers.js";
import { ScriptedSerialLink } from "./test-support/scripted-serial-link.js";

const REQUEST = 0x05;
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

  beforeEach(() => {
    timers = new ManualTimers();
    links = [];
    opened = [];
    path = "/dev/ttyUSB0";
    openFails = false;
  });

  it("asks the weight with the request byte and answers the stable weight", async () => {
    const reading = scale().read();
    await nextIoTurn();

    const link = links[0] as ScriptedSerialLink;
    expect(link.written).toEqual([[REQUEST]]);
    await answer(link, ...frameFor(710));
    expect(await reading).toEqual({ kind: "stable", weightThousandths: 710 });
  });

  it("answers not stable when the plate is moving", async () => {
    const reading = scale().read();
    await nextIoTurn();

    await answer(links[0] as ScriptedSerialLink, UNSTABLE);

    expect(await reading).toEqual({ kind: "not_stable" });
  });

  it("collects a frame that arrives in pieces before the quiet gap", async () => {
    const reading = scale().read();
    await nextIoTurn();
    const link = links[0] as ScriptedSerialLink;
    const frame = frameFor(1250);

    link.receive(...frame.slice(0, 4));
    link.receive(...frame.slice(4));
    timers.fire(QUIET_GAP_MS);

    expect(await reading).toEqual({ kind: "stable", weightThousandths: 1250 });
  });

  it("asks again right away after a discarded frame and takes the next good one", async () => {
    const reading = scale().read();
    await nextIoTurn();
    const link = links[0] as ScriptedSerialLink;

    await answer(link, 0x02, 0x30, 0x30);
    expect(link.written).toEqual([[REQUEST], [REQUEST]]);
    await answer(link, ...frameFor(500));

    expect(await reading).toEqual({ kind: "stable", weightThousandths: 500 });
  });

  it("answers not stable after three discarded answers", async () => {
    const reading = scale().read();
    await nextIoTurn();
    const link = links[0] as ScriptedSerialLink;

    await answer(link, 0x01, 0x02);
    await answer(link, 0x01, 0x02);
    await answer(link, 0x01, 0x02);

    expect(await reading).toEqual({ kind: "not_stable" });
    expect(link.written).toEqual([[REQUEST], [REQUEST], [REQUEST]]);
  });

  it("answers unavailable when the scale answers nothing within the limit", async () => {
    const reading = scale().read();
    await nextIoTurn();

    timers.fire(ANSWER_LIMIT_MS);

    expect(await reading).toEqual({ kind: "unavailable" });
  });

  it("stops collecting at the limit when the scale never goes quiet", async () => {
    const reading = scale().read();
    await nextIoTurn();
    const link = links[0] as ScriptedSerialLink;

    link.receive(UNSTABLE);
    timers.fire(ANSWER_LIMIT_MS);

    expect(await reading).toEqual({ kind: "not_stable" });
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
    const reading = connected.read();
    await nextIoTurn();
    await answer(links[0] as ScriptedSerialLink, ...frameFor(100));

    expect(await reading).toEqual({ kind: "stable", weightThousandths: 100 });
  });

  it("keeps the port open between readings", async () => {
    const connected = scale();
    const first = connected.read();
    await nextIoTurn();
    await answer(links[0] as ScriptedSerialLink, UNSTABLE);
    await first;

    const second = connected.read();
    await nextIoTurn();
    await answer(links[0] as ScriptedSerialLink, UNSTABLE);
    await second;

    expect(opened).toEqual(["/dev/ttyUSB0"]);
    expect(links[0]?.written).toEqual([[REQUEST], [REQUEST]]);
  });

  it("reopens the port when the scale shows up at another path, closing the old one", async () => {
    const connected = scale();
    const first = connected.read();
    await nextIoTurn();
    await answer(links[0] as ScriptedSerialLink, UNSTABLE);
    await first;

    path = "/dev/ttyUSB1";
    const second = connected.read();
    await nextIoTurn();
    await answer(links[1] as ScriptedSerialLink, UNSTABLE);
    await second;

    expect(opened).toEqual(["/dev/ttyUSB0", "/dev/ttyUSB1"]);
    expect(links[0]?.closed).toBe(true);
  });

  it("closes the port when the scale is no longer connected", async () => {
    const connected = scale();
    const first = connected.read();
    await nextIoTurn();
    await answer(links[0] as ScriptedSerialLink, UNSTABLE);
    await first;

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

    const next = connected.read();
    await nextIoTurn();
    await answer(links[1] as ScriptedSerialLink, UNSTABLE);
    expect(await next).toEqual({ kind: "not_stable" });
    expect(links[0]?.closed).toBe(true);
  });

  it("reopens the port after a link failure between readings", async () => {
    const connected = scale();
    const first = connected.read();
    await nextIoTurn();
    await answer(links[0] as ScriptedSerialLink, UNSTABLE);
    await first;
    (links[0] as ScriptedSerialLink).fail();

    const next = connected.read();
    await nextIoTurn();
    await answer(links[1] as ScriptedSerialLink, UNSTABLE);

    expect(await next).toEqual({ kind: "not_stable" });
    expect(opened).toHaveLength(2);
  });

  it("serves concurrent readings one after the other over the same link", async () => {
    const connected = scale();
    const first = connected.read();
    const second = connected.read();
    await nextIoTurn();
    const link = links[0] as ScriptedSerialLink;
    expect(link.written).toEqual([[REQUEST]]);

    await answer(link, ...frameFor(100));
    expect(await first).toEqual({ kind: "stable", weightThousandths: 100 });
    await nextIoTurn();
    expect(link.written).toEqual([[REQUEST], [REQUEST]]);
    await answer(link, ...frameFor(200));

    expect(await second).toEqual({ kind: "stable", weightThousandths: 200 });
    expect(opened).toHaveLength(1);
  });
});
