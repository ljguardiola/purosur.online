import { Parser } from "htmlparser2";

const DROPPED_ELEMENTS = new Set([
  "head",
  "title",
  "script",
  "style",
  "noscript",
  "template",
  "svg",
]);

const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "br",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);

const CELL_ELEMENTS = new Set(["td", "th"]);

export const UTF8_BYTE_ORDER_MARK = [0xef, 0xbb, 0xbf] as const;

export function startsWithUtf8ByteOrderMark(bytes: Uint8Array): boolean {
  return UTF8_BYTE_ORDER_MARK.every((byte, index) => bytes[index] === byte);
}

const CHARSET_DECLARATION = /<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i;
const BYTES_TO_SEARCH_FOR_CHARSET = 2048;

function decoderOf(html: Uint8Array): TextDecoder {
  if (startsWithUtf8ByteOrderMark(html)) {
    return new TextDecoder();
  }
  const head = Buffer.from(html.subarray(0, BYTES_TO_SEARCH_FOR_CHARSET)).toString("latin1");
  const label = CHARSET_DECLARATION.exec(head)?.[1];
  try {
    return new TextDecoder(label ?? "utf-8");
  } catch {
    return new TextDecoder();
  }
}

function tidyLine(line: string): string {
  const cells = line.split("\t").map((cell) => cell.replace(/\s+/g, " ").trim());
  return cells.join("\t").replace(/\t+$/, "");
}

export function webPageText(html: Uint8Array): string {
  const lines: string[] = [];
  let line = "";
  let droppedDepth = 0;
  let rowDepth = 0;

  function endLine(): void {
    const tidy = tidyLine(line);
    if (tidy.replaceAll("\t", "") !== "") {
      lines.push(tidy);
    }
    line = "";
  }

  function breakAround(name: string): void {
    if (name === "tr") {
      endLine();
    } else if (rowDepth > 0) {
      line += " ";
    } else {
      endLine();
    }
  }

  const parser = new Parser({
    onopentag(name) {
      if (DROPPED_ELEMENTS.has(name)) {
        droppedDepth += 1;
      } else if (droppedDepth === 0 && BLOCK_ELEMENTS.has(name)) {
        breakAround(name);
        rowDepth += name === "tr" ? 1 : 0;
      }
    },
    ontext(text) {
      if (droppedDepth === 0) {
        line += text.replaceAll("\t", " ");
      }
    },
    onclosetag(name) {
      if (DROPPED_ELEMENTS.has(name)) {
        droppedDepth -= 1;
      } else if (droppedDepth > 0) {
        return;
      } else if (CELL_ELEMENTS.has(name)) {
        line += "\t";
      } else if (BLOCK_ELEMENTS.has(name)) {
        rowDepth -= name === "tr" ? 1 : 0;
        breakAround(name);
      }
    },
  });
  parser.write(decoderOf(html).decode(html));
  parser.end();
  endLine();
  return lines.join("\n");
}
