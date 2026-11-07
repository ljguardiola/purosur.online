export type LabelRaster = {
  widthDots: number;
  heightRows: number;
  data: Uint8Array;
};

export type Frame = { cmd: number; data: Uint8Array };

const HEADER = 0x55;
const TRAILER = 0xaa;
const CHUNK_BYTES = 25;
const CHUNKS_PER_ROW = 3;
const MAX_REPEAT = 255;
const EMPTY_ROW = 0x84;
const BITMAP_ROW = 0x85;

export function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function checksum(cmd: number, data: ArrayLike<number>): number {
  let sum = cmd ^ data.length;
  for (let index = 0; index < data.length; index += 1) {
    sum ^= data[index] ?? 0;
  }
  return sum;
}

export function frame(cmd: number, data: ArrayLike<number>): Uint8Array {
  return Uint8Array.of(
    HEADER,
    HEADER,
    cmd,
    data.length,
    ...Array.from(data),
    checksum(cmd, data),
    TRAILER,
    TRAILER,
  );
}

function blackPixels(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    let rest = byte;
    while (rest !== 0) {
      count += rest & 1;
      rest >>= 1;
    }
  }
  return count;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function rowPackets(raster: LabelRaster): Uint8Array[] {
  const rowBytes = raster.widthDots / 8;
  const packets: Uint8Array[] = [];
  let y = 0;
  while (y < raster.heightRows) {
    const row = raster.data.subarray(y * rowBytes, (y + 1) * rowBytes);
    let repeat = 1;
    while (
      repeat < MAX_REPEAT &&
      y + repeat < raster.heightRows &&
      sameBytes(row, raster.data.subarray((y + repeat) * rowBytes, (y + repeat + 1) * rowBytes))
    ) {
      repeat += 1;
    }
    if (row.every((byte) => byte === 0)) {
      packets.push(frame(EMPTY_ROW, [...u16(y), repeat]));
    } else {
      const counts = Array.from({ length: CHUNKS_PER_ROW }, (_, chunk) =>
        blackPixels(row.subarray(chunk * CHUNK_BYTES, (chunk + 1) * CHUNK_BYTES)),
      );
      packets.push(frame(BITMAP_ROW, [...u16(y), ...counts, repeat, ...row]));
    }
    y += repeat;
  }
  return packets;
}

export function createFrameParser(): (chunk: Uint8Array) => Frame[] {
  let pending: number[] = [];

  return (chunk) => {
    pending.push(...chunk);
    const frames: Frame[] = [];
    for (;;) {
      const start = pending.findIndex(
        (byte, index) => byte === HEADER && pending[index + 1] === HEADER,
      );
      if (start === -1) {
        pending = pending.at(-1) === HEADER ? [HEADER] : [];
        return frames;
      }
      pending = pending.slice(start);
      if (pending.length < 4) {
        return frames;
      }
      const cmd = pending[2] ?? 0;
      const length = pending[3] ?? 0;
      const total = length + 7;
      if (pending.length < total) {
        return frames;
      }
      const data = Uint8Array.from(pending.slice(4, 4 + length));
      const valid =
        pending[4 + length] === checksum(cmd, data) &&
        pending[5 + length] === TRAILER &&
        pending[6 + length] === TRAILER;
      if (valid) {
        frames.push({ cmd, data });
        pending = pending.slice(total);
      } else {
        pending = pending.slice(1);
      }
    }
  };
}
