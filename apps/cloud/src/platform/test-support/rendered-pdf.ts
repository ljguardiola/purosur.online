import { inflateSync } from "node:zlib";

interface PdfObject {
  dictionary: string;
  stream: Buffer | undefined;
}

export function pdfObjectsWithInflatedStreams(pdf: Buffer): Map<number, PdfObject> {
  const text = pdf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  for (const match of text.matchAll(/(\d+) 0 obj\n/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const body = text.slice(start, text.indexOf("\nendobj", start));
    const streamStart = body.indexOf("\nstream\n");
    if (streamStart === -1) {
      objects.set(Number(match[1]), { dictionary: body, stream: undefined });
      continue;
    }
    const dictionary = body.slice(0, streamStart);
    const dataStart = start + streamStart + "\nstream\n".length;
    const raw = pdf.subarray(
      dataStart,
      dataStart + Number(dictionary.match(/\/Length (\d+)/)?.[1]),
    );
    const stream = dictionary.includes("/FlateDecode") ? inflateSync(raw) : raw;
    objects.set(Number(match[1]), { dictionary, stream });
  }
  return objects;
}

function objectAt(objects: Map<number, PdfObject>, id: number | string | undefined): PdfObject {
  const object = objects.get(Number(id));
  if (!object) {
    throw new Error(`the rendered PDF has no object ${id}`);
  }
  return object;
}

/** A ToUnicode CMap's `bfrange` arrays and `bfchar` pairs, as pdfkit writes them. */
function toUnicodeMap(cmap: string): Map<number, string> {
  const utf16 = (hex: string) => Buffer.from(hex, "hex").swap16().toString("utf16le");
  const map = new Map<number, string>();
  for (const range of cmap.matchAll(/<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/g)) {
    const values = [...(range[2] ?? "").matchAll(/<([0-9a-f]+)>/g)];
    values.forEach((value, offset) => {
      map.set(Number.parseInt(range[1] ?? "", 16) + offset, utf16(value[1] ?? ""));
    });
  }
  for (const pair of cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>\n/g)) {
    map.set(Number.parseInt(pair[1] ?? "", 16), utf16(pair[2] ?? ""));
  }
  return map;
}

interface RenderedFont {
  baseFont: string;
  embedded: boolean;
  ascent: number | undefined;
  toUnicode: Map<number, string> | undefined;
}

function renderedFont(objects: Map<number, PdfObject>, id: string): RenderedFont {
  const { dictionary } = objectAt(objects, id);
  const baseFont = dictionary.match(/\/BaseFont \/(\S+)/)?.[1] ?? "";
  const toUnicodeId = dictionary.match(/\/ToUnicode (\d+) 0 R/)?.[1];
  const descendantId = dictionary.match(/\/DescendantFonts \[(\d+) 0 R\]/)?.[1];
  if (!toUnicodeId || !descendantId) {
    return { baseFont, embedded: false, ascent: undefined, toUnicode: undefined };
  }
  const descriptorId = objectAt(objects, descendantId).dictionary.match(
    /\/FontDescriptor (\d+) 0 R/,
  )?.[1];
  const descriptor = objectAt(objects, descriptorId).dictionary;
  return {
    baseFont,
    embedded: /\/FontFile2 \d+ 0 R/.test(descriptor),
    ascent: Number(descriptor.match(/\/Ascent ([\d.]+)/)?.[1]),
    toUnicode: toUnicodeMap(objectAt(objects, toUnicodeId).stream?.toString("latin1") ?? ""),
  };
}

interface RenderedText {
  text: string;
  font: RenderedFont;
  fontSizePt: number;
  /** The text's baseline, in points from the page's top edge. */
  baselinePt: number;
  pageIndex: number;
}

export function pageDictionaries(objects: Map<number, PdfObject>): string[] {
  const pages = [...objects.values()].find((object) => /\/Type \/Pages\n/.test(object.dictionary));
  const kids = [
    ...(pages?.dictionary.match(/\/Kids \[([^\]]*)\]/)?.[1] ?? "").matchAll(/(\d+) 0 R/g),
  ];
  return kids.map((kid) => objectAt(objects, kid[1]).dictionary);
}

export function pageContents(objects: Map<number, PdfObject>): string[] {
  return pageDictionaries(objects).map(
    (page) =>
      objectAt(objects, page.match(/\/Contents (\d+) 0 R/)?.[1]).stream?.toString("latin1") ?? "",
  );
}

export function renderedTextRuns(pdf: Buffer): RenderedText[] {
  const objects = pdfObjectsWithInflatedStreams(pdf);
  const fontIds = new Map<string, string>();
  for (const object of objects.values()) {
    for (const entry of object.dictionary.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      fontIds.set(entry[1] ?? "", entry[2] ?? "");
    }
  }
  const pageHeights = pageDictionaries(objects).map((page) =>
    Number(page.match(/\/MediaBox \[0 0 [\d.]+ ([\d.]+)\]/)?.[1]),
  );

  const runs: RenderedText[] = [];
  pageContents(objects).forEach((content, pageIndex) => {
    let font: RenderedFont | undefined;
    let fontSizePt = 0;
    let baselineFromBottomPt = 0;
    const operators = /\/(F\d+) ([\d.]+) Tf|1 0 0 1 [\d.-]+ ([\d.-]+) Tm|\[([^\]]*)\] TJ/g;
    for (const operator of content.matchAll(operators)) {
      if (operator[1]) {
        font = renderedFont(objects, fontIds.get(operator[1]) ?? "");
        fontSizePt = Number(operator[2]);
      } else if (operator[3]) {
        baselineFromBottomPt = Number(operator[3]);
      } else if (font) {
        const hex = [...(operator[4] ?? "").matchAll(/<([0-9a-f]+)>/g)].map((m) => m[1]).join("");
        const toUnicode = font.toUnicode;
        const text = toUnicode
          ? (hex.match(/.{4}/g) ?? [])
              .map((code) => Number.parseInt(code, 16))
              .map((code) => (code === 0 ? "�" : (toUnicode.get(code) ?? "�")))
              .join("")
          : Buffer.from(hex, "hex").toString("latin1");
        runs.push({
          text,
          font,
          fontSizePt,
          baselinePt: (pageHeights[pageIndex] ?? 0) - baselineFromBottomPt,
          pageIndex,
        });
      }
    }
  });
  return runs;
}

export function renderedTexts(pdf: Buffer): string[] {
  return renderedTextRuns(pdf).map((run) => run.text);
}
