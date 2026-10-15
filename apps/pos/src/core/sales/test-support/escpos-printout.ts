import { decodePc850 } from "../receipt-printer/pc850";

const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;
const PC850_TABLE = 2;
const ALIGNMENTS = ["left", "center", "right"];
const QR_CORRECTION_LEVELS = ["L", "M", "Q", "H"];
const STYLE_MARKER = /\[\/?(bold|small)\]/g;

interface PrintedRow {
  text: string;
  small: boolean;
}

interface Printout {
  text: string;
  textLines: string[];
  rows: PrintedRow[];
}

export function printoutOf(bytes: Uint8Array): Printout {
  const lines: string[] = [];
  const rows: PrintedRow[] = [];
  let pending = "";
  let position = 0;

  function take(): number {
    const byte = bytes[position];
    if (byte === undefined) {
      throw new Error("the bytes end in the middle of a command");
    }
    position += 1;
    return byte;
  }

  function flushPending(): void {
    if (pending !== "") {
      lines.push(pending);
      pending = "";
    }
  }

  function marker(text: string): void {
    flushPending();
    lines.push(text);
  }

  while (position < bytes.length) {
    const byte = take();
    if (byte === LINE_FEED) {
      lines.push(pending);
      rows.push({ text: pending.replace(STYLE_MARKER, ""), small: pending.includes("[small]") });
      pending = "";
    } else if (byte === ESC) {
      const command = take();
      if (command === 0x40) {
        marker("[init]");
      } else if (command === 0x74) {
        const table = take();
        marker(table === PC850_TABLE ? "[codepage PC850]" : `[codepage ${table}]`);
      } else if (command === 0x45) {
        pending += take() === 0 ? "[/bold]" : "[bold]";
      } else if (command === 0x4d) {
        pending += take() === 0 ? "[/small]" : "[small]";
      } else if (command === 0x61) {
        const alignment = take();
        marker(`[align ${ALIGNMENTS[alignment] ?? alignment}]`);
      } else if (command === 0x4a) {
        marker(`[feed dots ${take()}]`);
      } else if (command === 0x64) {
        marker(`[feed ${take()}]`);
      } else {
        throw new Error(`unknown ESC command 0x${command.toString(16)}`);
      }
    } else if (byte === GS) {
      const command = take();
      if (command === 0x76 && take() === 0x30) {
        const mode = take();
        const widthBytes = take() + take() * 256;
        const height = take() + take() * 256;
        if (mode !== 0) {
          throw new Error(`unknown raster mode ${mode}`);
        }
        position += widthBytes * height;
        marker(`[logo ${widthBytes * 8}x${height}]`);
      } else if (command === 0x28 && take() === 0x6b) {
        const length = take() + take() * 256;
        if (take() !== 0x31) {
          throw new Error("unknown symbol function");
        }
        const parameters = Array.from({ length: length - 1 }, take);
        marker(qrMarker(parameters));
      } else if (command === 0x56) {
        const mode = take();
        if (mode !== 0 && mode !== 1) {
          throw new Error(`unknown cut mode ${mode}`);
        }
        marker(mode === 0 ? "[cut full]" : "[cut partial]");
      } else {
        throw new Error(`unknown GS command 0x${command.toString(16)}`);
      }
    } else {
      pending += decodePc850(Uint8Array.of(byte));
    }
  }
  flushPending();
  return { text: lines.join("\n"), textLines: rows.map(({ text }) => text), rows };
}

function qrMarker([fn = 0, ...data]: number[]): string {
  const value = data[data.length - 1] ?? 0;
  if (fn === 0x41) {
    return `[qr model ${data[0] === 0x32 ? 2 : data[0]}]`;
  }
  if (fn === 0x43) {
    return `[qr module ${value}]`;
  }
  if (fn === 0x45) {
    return `[qr correction ${QR_CORRECTION_LEVELS[value - 0x30] ?? value}]`;
  }
  if (fn === 0x50) {
    return `[qr store ${decodePc850(Uint8Array.from(data.slice(1)))}]`;
  }
  if (fn === 0x51) {
    return "[qr print]";
  }
  throw new Error(`unknown symbol function 0x${fn.toString(16)}`);
}
