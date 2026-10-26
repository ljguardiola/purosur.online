import { expect, test } from "vitest";
import { decodeWithJsQr } from "./jsqr-decoder";

const QR_OF_QR_1 = [
  "#######...#.#.#######",
  "#.....#.....#.#.....#",
  "#.###.#.#.#...#.###.#",
  "#.###.#.....#.#.###.#",
  "#.###.#..#.##.#.###.#",
  "#.....#..###..#.....#",
  "#######.#.#.#.#######",
  "........#.#..........",
  "###.#####.#.###...#..",
  "#..#.#..#.##.#.#.#...",
  "..#.###....#.###...##",
  ".#.#.....#.###.###...",
  "..##.##....#.###....#",
  "........#.....#...#..",
  "#######.#...#...#####",
  "#.....#.###...#..#.#.",
  "#.###.#.#.#.#.#.##.##",
  "#.###.#....#.#.#.#.#.",
  "#.###.#.##.#.###.##.#",
  "#.....#.#..###.###.#.",
  "#######.#..#.###..###",
];

const MODULE_PIXELS = 4;
const QUIET_ZONE_MODULES = 4;

function frameOf(rows: readonly string[]): ImageData {
  const side = (rows.length + QUIET_ZONE_MODULES * 2) * MODULE_PIXELS;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < side; y += 1) {
    for (let x = 0; x < side; x += 1) {
      const row = rows[Math.floor(y / MODULE_PIXELS) - QUIET_ZONE_MODULES];
      if (row?.[Math.floor(x / MODULE_PIXELS) - QUIET_ZONE_MODULES] === "#") {
        data.fill(0, (y * side + x) * 4, (y * side + x) * 4 + 3);
      }
    }
  }
  return { data, width: side, height: side, colorSpace: "srgb" };
}

test("reads the text of a QR code in the frame", async () => {
  expect(await decodeWithJsQr(frameOf(QR_OF_QR_1))).toBe("QR-1");
});

test("reads nothing in a frame without a QR code", async () => {
  expect(await decodeWithJsQr(frameOf([]))).toBeNull();
});
