import type { HtmlTagDescriptor, Plugin } from "vite";

type BuiltFile =
  | { readonly type: "chunk"; readonly fileName: string }
  | { readonly type: "asset"; readonly fileName: string; readonly names: readonly string[] };

export function preloadFont(fontFileName: string) {
  let base = "/";
  return {
    name: "purosur:preload-font",
    apply: "build",
    configResolved(config: { readonly base: string }) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(
        _html: string,
        { bundle = {} }: { readonly bundle?: Readonly<Record<string, BuiltFile>> },
      ): HtmlTagDescriptor[] {
        const font = Object.values(bundle).find(
          (file) => file.type === "asset" && file.names.includes(fontFileName),
        );
        if (font === undefined) {
          throw new Error(`the build emitted no ${fontFileName} to preload`);
        }
        return [
          {
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              crossorigin: true,
              href: `${base}${font.fileName}`,
            },
            injectTo: "head",
          },
        ];
      },
    },
  } satisfies Plugin;
}
