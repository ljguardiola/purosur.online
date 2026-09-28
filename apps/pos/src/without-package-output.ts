import { relative, sep } from "node:path";
import type { Plugin } from "vite";

export function withoutPackageOutput(repoRoot: string) {
  return {
    name: "purosur:without-package-output",
    enforce: "pre",
    load(id: string): undefined {
      const path = relative(repoRoot, id).split(sep).join("/");
      if (/^packages\/[^/]+\/dist\//.test(path)) {
        throw new Error(
          `${path} is a workspace package's compiled output, which a clean checkout does not have; the register must build from the package's source`,
        );
      }
      return undefined;
    },
  } satisfies Plugin;
}
