const HEX_COLOR = "#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?";

export function parseColorTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const palette = parsePalette(stripComments(css));

  for (const themeBlock of extractThemeBlocks(css)) {
    const declaration = new RegExp(
      `--color-([a-z0-9-]+):\\s*(?:(${HEX_COLOR})|var\\(--palette-([a-z0-9-]+)\\))\\s*;`,
      "g",
    );
    for (const match of themeBlock.matchAll(declaration)) {
      const [, name, hex, paletteName] = match;
      if (!name) {
        continue;
      }
      if (hex) {
        tokens[name] = hex;
      } else if (paletteName) {
        const resolved = palette[paletteName];
        if (!resolved) {
          throw new Error(
            `--color-${name} references --palette-${paletteName}, which is not declared`,
          );
        }
        tokens[name] = resolved;
      }
    }
  }

  return tokens;
}

function parsePalette(source: string): Record<string, string> {
  const palette: Record<string, string> = {};
  const declaration = new RegExp(`--palette-([a-z0-9-]+):\\s*(${HEX_COLOR})\\s*;`, "g");
  for (const [, name, hex] of source.matchAll(declaration)) {
    if (name && hex) {
      palette[name] = hex;
    }
  }
  return palette;
}

// Drops /* ... */ comments before any @theme scan, so a mention of "@theme" or a stray brace
// left inside a comment is never mistaken for real stylesheet structure.
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Finds every @theme block's own closing brace by counting nesting depth, instead of assuming it
// is the first "}" that starts a line: that assumption breaks as soon as a nested block inside
// @theme (e.g. a media query) closes on a line of its own before @theme itself does.
function extractThemeBlocks(css: string): string[] {
  const source = stripComments(css);
  const blocks: string[] = [];
  let searchFrom = 0;

  for (let themeIndex = source.indexOf("@theme", searchFrom); themeIndex !== -1; ) {
    const openBrace = source.indexOf("{", themeIndex);
    if (openBrace === -1) {
      throw new Error("Unterminated @theme block: no opening brace found after @theme");
    }

    let depth = 0;
    let closeBrace = -1;
    for (let i = openBrace; i < source.length; i++) {
      if (source[i] === "{") {
        depth++;
      } else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          closeBrace = i;
          break;
        }
      }
    }

    if (closeBrace === -1) {
      throw new Error("Unterminated @theme block: its closing brace is missing");
    }

    blocks.push(source.slice(openBrace + 1, closeBrace));
    searchFrom = closeBrace + 1;
    themeIndex = source.indexOf("@theme", searchFrom);
  }

  return blocks;
}
