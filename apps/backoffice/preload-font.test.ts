import { expect, test } from "vitest";
import { preloadFont } from "./preload-font";

const FONT = "font-latin-normal.woff2";

const builtBundle = {
  "assets/index-abc.js": { type: "chunk", fileName: "assets/index-abc.js" },
  "assets/index-abc.css": { type: "asset", fileName: "assets/index-abc.css", names: ["index.css"] },
  "assets/font-latin-ext-normal-111.woff2": {
    type: "asset",
    fileName: "assets/font-latin-ext-normal-111.woff2",
    names: ["font-latin-ext-normal.woff2"],
  },
  "assets/font-latin-normal-222.woff2": {
    type: "asset",
    fileName: "assets/font-latin-normal-222.woff2",
    names: [FONT],
  },
} as const;

function builtWithBase(base: string) {
  const plugin = preloadFont(FONT);
  plugin.configResolved({ base });
  return plugin;
}

test("preloads the emitted font file from the head of index.html", () => {
  const plugin = builtWithBase("/");

  expect(plugin.transformIndexHtml.handler("", { bundle: builtBundle })).toEqual([
    {
      tag: "link",
      attrs: {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        crossorigin: true,
        href: "/assets/font-latin-normal-222.woff2",
      },
      injectTo: "head",
    },
  ]);
});

test("addresses the font under the build's base path", () => {
  const plugin = builtWithBase("/backoffice/");

  expect(plugin.transformIndexHtml.handler("", { bundle: builtBundle })).toMatchObject([
    { attrs: { href: "/backoffice/assets/font-latin-normal-222.woff2" } },
  ]);
});

test("fails the build when the font was not emitted", () => {
  const { "assets/font-latin-normal-222.woff2": _font, ...withoutFont } = builtBundle;
  const plugin = builtWithBase("/");

  expect(() => plugin.transformIndexHtml.handler("", { bundle: withoutFont })).toThrow(FONT);
});

test("runs only when building, after the bundle is written", () => {
  const plugin = preloadFont(FONT);

  expect(plugin.apply).toBe("build");
  expect(plugin.transformIndexHtml.order).toBe("post");
});
