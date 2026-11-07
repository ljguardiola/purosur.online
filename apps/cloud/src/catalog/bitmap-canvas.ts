const BITS_PER_BYTE = 8;

export interface Point {
  x: number;
  y: number;
}

interface Crossing {
  x: number;
  winding: 1 | -1;
}

export class Bitmap {
  readonly width: number;
  readonly height: number;
  private readonly dots: Uint8Array;

  constructor(width: number, height: number) {
    if (width % BITS_PER_BYTE !== 0) {
      throw new RangeError("a bitmap's width must be a multiple of 8 dots");
    }
    this.width = width;
    this.height = height;
    this.dots = new Uint8Array(width * height);
  }

  isBlack(x: number, y: number): boolean {
    return this.dots[this.indexOf(x, y)] === 1;
  }

  fillRect(left: number, top: number, width: number, height: number): void {
    for (let y = top; y < top + height; y += 1) {
      this.fillRow(y, left, left + width);
    }
  }

  fillPolygons(polygons: Point[][]): void {
    const top = Math.max(0, Math.floor(Math.min(...polygons.flat().map((point) => point.y))));
    const bottom = Math.min(
      this.height,
      Math.ceil(Math.max(...polygons.flat().map((point) => point.y))),
    );
    for (let y = top; y < bottom; y += 1) {
      const crossings = rowCrossings(polygons, y + 0.5);
      let winding = 0;
      crossings.forEach((crossing, index) => {
        winding += crossing.winding;
        const next = crossings[index + 1];
        if (winding !== 0 && next) {
          this.fillRow(y, Math.ceil(crossing.x - 0.5), Math.ceil(next.x - 0.5));
        }
      });
    }
  }

  pack(): Uint8Array {
    const rowBytes = this.width / BITS_PER_BYTE;
    const packed = new Uint8Array(rowBytes * this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.dots[y * this.width + x] === 1) {
          const index = y * rowBytes + Math.floor(x / BITS_PER_BYTE);
          packed[index] = (packed[index] ?? 0) | (0x80 >> (x % BITS_PER_BYTE));
        }
      }
    }
    return packed;
  }

  private fillRow(y: number, from: number, to: number): void {
    if (y < 0 || y >= this.height) {
      return;
    }
    const start = Math.max(0, from);
    const end = Math.min(this.width, to);
    if (end > start) {
      this.dots.fill(1, y * this.width + start, y * this.width + end);
    }
  }

  private indexOf(x: number, y: number): number {
    return x < 0 || x >= this.width || y < 0 || y >= this.height ? -1 : y * this.width + x;
  }
}

function rowCrossings(polygons: Point[][], sampleY: number): Crossing[] {
  const crossings: Crossing[] = [];
  for (const polygon of polygons) {
    polygon.forEach((from, index) => {
      const to = polygon[(index + 1) % polygon.length];
      if (!to || from.y === to.y) {
        return;
      }
      const goesDown = to.y > from.y;
      const [upper, lower] = goesDown ? [from, to] : [to, from];
      if (sampleY >= upper.y && sampleY < lower.y) {
        const progress = (sampleY - from.y) / (to.y - from.y);
        crossings.push({ x: from.x + progress * (to.x - from.x), winding: goesDown ? 1 : -1 });
      }
    });
  }
  return crossings.sort((a, b) => a.x - b.x);
}
