import { encodePc850 } from "./pc850";

export const COLUMNS = 48;
export const SMALL_COLUMNS = 64;
export const RULE = "─".repeat(COLUMNS);

const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;
const PC850_TABLE = 2;
const FEED_LINES = 5;
const CENTER_ALIGNMENT = 1;
const LEFT_ALIGNMENT = 0;
const QR_STORE_OVERHEAD = 3;
const QR_MAX_MODULE_DOTS = 16;
const QR_CORRECTION_LEVELS = { L: 0x30, M: 0x31 } as const;
const QR_BYTE_CAPACITY_AT_LEVEL_L = [
  17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
  929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
  2563, 2699, 2809, 2953,
];

export type QrSize =
  | { correction: "L"; sideDots: number }
  | { correction: "M"; moduleDots: number };

export interface RasterImage {
  widthDots: number;
  heightDots: number;
  rows: Uint8Array;
}

export class EscPosWriter {
  private readonly chunks: Uint8Array[] = [];

  initialize(): void {
    this.command(ESC, 0x40);
    this.command(ESC, 0x74, PC850_TABLE);
  }

  lines(lines: readonly string[]): void {
    for (const line of lines) {
      this.chunks.push(encodePc850(line), Uint8Array.of(LINE_FEED));
    }
  }

  bold(lines: readonly string[]): void {
    for (const line of lines) {
      this.command(ESC, 0x45, 1);
      this.chunks.push(encodePc850(line));
      this.command(ESC, 0x45, 0);
      this.chunks.push(Uint8Array.of(LINE_FEED));
    }
  }

  small(lines: readonly string[]): void {
    for (const line of lines) {
      this.command(ESC, 0x4d, 1);
      this.chunks.push(encodePc850(line));
      this.command(ESC, 0x4d, 0);
      this.chunks.push(Uint8Array.of(LINE_FEED));
    }
  }

  feed(dots: number): void {
    this.command(ESC, 0x4a, dots);
  }

  rasterImage({ widthDots, heightDots, rows }: RasterImage): void {
    const widthBytes = widthDots / 8;
    this.command(
      GS,
      0x76,
      0x30,
      0,
      widthBytes & 0xff,
      widthBytes >> 8,
      heightDots & 0xff,
      heightDots >> 8,
    );
    this.chunks.push(rows);
  }

  qr(text: string, size: QrSize): void {
    const data = encodePc850(text);
    const stored = data.length + QR_STORE_OVERHEAD;
    const moduleDots =
      size.correction === "L" ? fittedModuleDots(data.length, size.sideDots) : size.moduleDots;
    this.command(ESC, 0x61, CENTER_ALIGNMENT);
    this.command(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, moduleDots);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, QR_CORRECTION_LEVELS[size.correction]);
    this.command(GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30);
    this.chunks.push(data);
    this.command(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30);
    this.command(ESC, 0x61, LEFT_ALIGNMENT);
  }

  cut(): void {
    this.command(ESC, 0x64, FEED_LINES);
    this.command(GS, 0x56, 1);
  }

  bytes(): Uint8Array {
    return concatenated(this.chunks);
  }

  private command(...bytes: number[]): void {
    this.chunks.push(Uint8Array.from(bytes));
  }
}

function fittedModuleDots(bytes: number, sideDots: number): number {
  const version = QR_BYTE_CAPACITY_AT_LEVEL_L.findIndex((capacity) => bytes <= capacity) + 1;
  const modules = 17 + 4 * (version === 0 ? QR_BYTE_CAPACITY_AT_LEVEL_L.length : version);
  const nearest = Math.round(sideDots / modules);
  return Math.min(Math.max(nearest, 1), QR_MAX_MODULE_DOTS);
}

export function concatenated(chunks: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

export function wrapped(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let word of text.split(" ")) {
    while (word.length > width) {
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function centered(text: string, width = COLUMNS): string[] {
  return wrapped(text, width).map(
    (line) => " ".repeat(Math.floor((width - line.length) / 2)) + line,
  );
}

export function row(left: string, right: string, indent = "", width = COLUMNS): string[] {
  const room = width - indent.length - right.length - 1;
  if (room < width / 2) {
    return [
      ...wrapped(left, width - indent.length).map((line) => indent + line),
      ...wrapped(right, width).map((line) => line.padStart(width)),
    ];
  }
  const lines = wrapped(left, room).map((line) => indent + line);
  const last = lines.pop() ?? indent;
  return [...lines, last + " ".repeat(width - last.length - right.length) + right];
}

export function labeledValue(label: string, value: string): string[] {
  if (label.length + 1 + value.length <= COLUMNS) {
    return [label + " ".repeat(COLUMNS - label.length - value.length) + value];
  }
  return [label, ...wrapped(value, COLUMNS).map((line) => line.padStart(COLUMNS))];
}
