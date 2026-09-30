import { relative, sep } from "node:path";

export function withoutPackageOutput(repoRoot) {
  return {
    name: "purosur:without-package-output",
    enforce: "pre",
    load(id) {
      const path = relative(repoRoot, id).split(sep).join("/");
      if (/^packages\/[^/]+\/dist\//.test(path)) {
        throw new Error(
          `${path} is a workspace package's compiled output, which a clean checkout does not have; workspace packages load from their source`,
        );
      }
      return undefined;
    },
  };
}
