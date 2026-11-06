import { describe, expect, test } from "vitest";
import { createFrameParser, frame, type LabelRaster, rowPackets, u16 } from "./packets";

const ROW_BYTES = 50;

function raster(rows: Uint8Array[]): LabelRaster {
  const data = new Uint8Array(rows.length * ROW_BYTES);
  rows.forEach((row, index) => {
    data.set(row, index * ROW_BYTES);
  });
  return { widthDots: 400, heightRows: rows.length, data };
}

const whiteRow = () => new Uint8Array(ROW_BYTES);
const filledRow = (byte: number) => new Uint8Array(ROW_BYTES).fill(byte);

describe("u16", () => {
  test("is big-endian", () => {
    expect(u16(0x0190)).toEqual([0x01, 0x90]);
    expect(u16(240)).toEqual([0x00, 0xf0]);
  });
});

describe("frame", () => {
  test("wraps the command, the length and the data between the markers with the xor checksum", () => {
    expect([...frame(0xc1, [1])]).toEqual([
      0x55,
      0x55,
      0xc1,
      0x01,
      0x01,
      0xc1 ^ 0x01 ^ 0x01,
      0xaa,
      0xaa,
    ]);
  });

  test("checksums the command, the length and every data byte", () => {
    const bytes = frame(0x21, [0x04, 0x10, 0x20]);
    expect(bytes[bytes.length - 3]).toBe(0x21 ^ 0x03 ^ 0x04 ^ 0x10 ^ 0x20);
  });

  test("frames an empty payload", () => {
    expect([...frame(0xe3, [])]).toEqual([0x55, 0x55, 0xe3, 0x00, 0xe3, 0xaa, 0xaa]);
  });
});

describe("rowPackets", () => {
  test("sends a run of white rows as one empty-row packet with the repeat count", () => {
    const packets = rowPackets(raster([whiteRow(), whiteRow(), whiteRow()]));
    expect(packets).toEqual([frame(0x84, [0, 0, 3])]);
  });

  test("sends a bitmap row with the black pixel count of each 25 byte chunk", () => {
    const row = whiteRow();
    row[0] = 0xff;
    row[1] = 0x01;
    row[30] = 0x0f;
    const packets = rowPackets(raster([row]));
    expect(packets).toEqual([frame(0x85, [0, 0, 9, 4, 0, 1, ...row])]);
  });

  test("merges identical consecutive rows and starts each run at its own y", () => {
    const packets = rowPackets(
      raster([
        whiteRow(),
        whiteRow(),
        filledRow(0x80),
        filledRow(0x80),
        filledRow(0x80),
        whiteRow(),
      ]),
    );
    expect(packets).toEqual([
      frame(0x84, [0, 0, 2]),
      frame(0x85, [0, 2, 25, 25, 0, 3, ...filledRow(0x80)]),
      frame(0x84, [0, 5, 1]),
    ]);
  });

  test("splits a run longer than 255 rows", () => {
    const rows = Array.from({ length: 300 }, whiteRow);
    expect(rowPackets(raster(rows))).toEqual([frame(0x84, [0, 0, 255]), frame(0x84, [0, 255, 45])]);
  });

  test("writes y above 255 as two bytes", () => {
    const rows = [...Array.from({ length: 256 }, whiteRow), filledRow(0xff)];
    const last = rowPackets(raster(rows)).at(-1);
    expect(last).toEqual(frame(0x85, [1, 0, 200, 200, 0, 1, ...filledRow(0xff)]));
  });
});

describe("createFrameParser", () => {
  const answer = frame(0xc2, [1]);
  const other = frame(0xb3, [0, 2, 0]);

  test("reads a frame delivered whole", () => {
    expect(createFrameParser()(answer)).toEqual([{ cmd: 0xc2, data: Uint8Array.of(1) }]);
  });

  test("reads a frame split across chunks", () => {
    const parse = createFrameParser();
    expect(parse(answer.slice(0, 3))).toEqual([]);
    expect(parse(answer.slice(3, 6))).toEqual([]);
    expect(parse(answer.slice(6))).toEqual([{ cmd: 0xc2, data: Uint8Array.of(1) }]);
  });

  test("reads several frames merged in one chunk", () => {
    const merged = Uint8Array.of(...answer, ...other);
    expect(createFrameParser()(merged).map((f) => f.cmd)).toEqual([0xc2, 0xb3]);
  });

  test("skips bytes before a frame", () => {
    const noisy = Uint8Array.of(0x03, 0x00, ...answer);
    expect(createFrameParser()(noisy).map((f) => f.cmd)).toEqual([0xc2]);
  });

  test("drops a frame whose checksum is wrong and reads the next one", () => {
    const corrupted = answer.slice();
    corrupted[corrupted.length - 3] = (corrupted[corrupted.length - 3] ?? 0) ^ 0xff;
    const parsed = createFrameParser()(Uint8Array.of(...corrupted, ...other));
    expect(parsed.map((f) => f.cmd)).toEqual([0xb3]);
  });
});
