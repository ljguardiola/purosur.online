import { create, type Font, type Glyph } from "fontkit";
import type { Bitmap, Point } from "./bitmap-canvas.js";
import { BOLD_FONT_FILE } from "./pdf-fonts.js";

const CURVE_SEGMENTS = 8;
const ELLIPSIS = "…";

function loadFont(): Font {
  const font = create(BOLD_FONT_FILE);
  if (!("layout" in font)) {
    throw new Error("the bold font file is a font collection");
  }
  return font;
}

const font = loadFont();

export interface TextPlacement {
  x: number;
  baseline: number;
  fontSize: number;
}

export function measureText(text: string, fontSize: number): number {
  return (font.layout(text).advanceWidth * fontSize) / font.unitsPerEm;
}

export function fontMetrics(fontSize: number): { ascent: number; descent: number } {
  return {
    ascent: (font.ascent * fontSize) / font.unitsPerEm,
    descent: (-font.descent * fontSize) / font.unitsPerEm,
  };
}

function flatten(from: Point, controls: Point[]): Point[] {
  const points: Point[] = [];
  for (let step = 1; step <= CURVE_SEGMENTS; step += 1) {
    const t = step / CURVE_SEGMENTS;
    const nodes = [from, ...controls];
    for (let level = nodes.length - 1; level > 0; level -= 1) {
      for (let index = 0; index < level; index += 1) {
        const a = nodes[index] as Point;
        const b = nodes[index + 1] as Point;
        nodes[index] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    points.push(nodes[0] as Point);
  }
  return points;
}

function glyphPolygons(glyph: Glyph, toDots: (x: number, y: number) => Point): Point[][] {
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let pen: Point = { x: 0, y: 0 };
  const moveTo = (point: Point) => {
    pen = point;
    current.push(point);
  };
  for (const { command, args } of glyph.path.commands) {
    const points: Point[] = [];
    for (let index = 0; index + 1 < args.length; index += 2) {
      points.push(toDots(args[index] as number, args[index + 1] as number));
    }
    if (command === "moveTo") {
      current = [];
      moveTo(points[0] as Point);
    } else if (command === "lineTo") {
      moveTo(points[0] as Point);
    } else if (command === "quadraticCurveTo" || command === "bezierCurveTo") {
      const curve = flatten(pen, points);
      current.push(...curve);
      pen = curve[curve.length - 1] as Point;
    } else {
      polygons.push(current);
      current = [];
    }
  }
  return polygons;
}

export function drawText(bitmap: Bitmap, text: string, placement: TextPlacement): void {
  const scale = placement.fontSize / font.unitsPerEm;
  const run = font.layout(text);
  const polygons: Point[][] = [];
  let penX = placement.x;
  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index];
    const originX = penX + (position?.xOffset ?? 0) * scale;
    polygons.push(
      ...glyphPolygons(glyph, (x, y) => ({
        x: originX + x * scale,
        y: placement.baseline - y * scale,
      })),
    );
    penX += (position?.xAdvance ?? 0) * scale;
  });
  if (polygons.length > 0) {
    bitmap.fillPolygons(polygons);
  }
}

function fittingPrefix(
  characters: string[],
  maxWidth: number,
  fontSize: number,
  tail = "",
): string {
  let length = characters.length;
  while (
    length > 0 &&
    measureText(characters.slice(0, length).join("") + tail, fontSize) > maxWidth
  ) {
    length -= 1;
  }
  return characters.slice(0, length).join("");
}

export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  fontSize: number,
): string[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  while (words.length > 0) {
    if (lines.length === maxLines - 1) {
      const rest = words.join(" ");
      lines.push(
        measureText(rest, fontSize) <= maxWidth
          ? rest
          : `${fittingPrefix(Array.from(rest), maxWidth, fontSize, ELLIPSIS).trimEnd()}${ELLIPSIS}`,
      );
      break;
    }
    let line = "";
    while (words.length > 0) {
      const candidate = line === "" ? (words[0] as string) : `${line} ${words[0]}`;
      if (measureText(candidate, fontSize) > maxWidth) {
        break;
      }
      line = candidate;
      words.shift();
    }
    if (line === "") {
      const characters = Array.from(words[0] as string);
      line = fittingPrefix(characters, maxWidth, fontSize) || (characters[0] as string);
      words[0] = (words[0] as string).slice(line.length);
    }
    lines.push(line);
  }
  return lines;
}
