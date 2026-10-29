import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { extensionsCreatedBy } from "./previous-release-contract.mjs";

// Preloaded with `--import` into the previous release's test run. PGlite loads only the
// extensions passed to its constructor, and the previous release's test databases were written
// before the new release's migrations created these, so every PGlite it opens gets them here.

const { MIGRATIONS_DIR } = process.env;
if (!MIGRATIONS_DIR) {
  throw new Error("previous-release-pglite-extensions: MIGRATIONS_DIR is required");
}

const extensions = extensionsCreatedBy(MIGRATIONS_DIR);
const PGLITE_ENTRY_RE = /\/@electric-sql\/pglite\/dist\/index\.js$/;
const WITH_EXTENSIONS = "previous-release-pglite:";

function contribUrl(name, pgliteUrl) {
  const url = new URL(`./contrib/${name}.js`, pgliteUrl);
  if (!existsSync(fileURLToPath(url))) {
    throw new Error(
      `previous-release-pglite-extensions: PGlite ships no "${name}" extension, which the new release's migrations create`,
    );
  }
  return url.href;
}

function pgliteWithExtensions(pgliteUrl) {
  const entry = JSON.stringify(pgliteUrl);
  const imports = extensions.map(
    (name, at) => `import * as extension${at} from ${JSON.stringify(contribUrl(name, pgliteUrl))};`,
  );
  const required = extensions.map(
    (name, at) =>
      `${JSON.stringify(name)}: Object.values(extension${at}).find((value) => typeof value?.setup === "function")`,
  );
  return `
import * as pglite from ${entry};
${imports.join("\n")}
export * from ${entry};

const required = { ${required.join(", ")} };

function withRequired(options = {}) {
  return { ...options, extensions: { ...required, ...options.extensions } };
}

export class PGlite extends pglite.PGlite {
  constructor(dataDirOrOptions, options) {
    if (typeof dataDirOrOptions === "string") {
      super(dataDirOrOptions, withRequired(options));
    } else {
      super(withRequired(dataDirOrOptions), options);
    }
  }

  static async create(dataDirOrOptions, options) {
    const database = new PGlite(dataDirOrOptions, options);
    await database.waitReady;
    return database;
  }
}
`;
}

if (extensions.length > 0) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (PGLITE_ENTRY_RE.test(resolved.url) && !context.parentURL?.startsWith(WITH_EXTENSIONS)) {
        return { url: `${WITH_EXTENSIONS}${resolved.url}`, format: "module", shortCircuit: true };
      }
      return resolved;
    },
    load(url, context, nextLoad) {
      if (url.startsWith(WITH_EXTENSIONS)) {
        return {
          format: "module",
          source: pgliteWithExtensions(url.slice(WITH_EXTENSIONS.length)),
          shortCircuit: true,
        };
      }
      return nextLoad(url, context);
    },
  });
}
