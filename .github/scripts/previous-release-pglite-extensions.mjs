import { extensionsCreatedBy, loadPgliteExtensions } from "./previous-release-contract.mjs";

// Preloaded with `--import` into the previous release's test run, so every PGlite it opens gets
// the extensions the new release's migrations create.

const { MIGRATIONS_DIR } = process.env;
if (!MIGRATIONS_DIR) {
  throw new Error("previous-release-pglite-extensions: MIGRATIONS_DIR is required");
}

loadPgliteExtensions(extensionsCreatedBy(MIGRATIONS_DIR));
