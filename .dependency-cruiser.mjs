// Cloud-only concepts: the register (apps/pos) never runs their use cases.
export const CLOUD_ONLY_CONCEPTS = ["purchasing", "alerts", "catalog", "pricing"];

// Matches an npm package either by its raw specifier (left unresolved when the
// package isn't installed) or by its resolved node_modules path, never by a repo
// folder that happens to share the package's name.
function npmPackage(name) {
  return `^${name}(/|$)|(^|/)node_modules/${name}/`;
}

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "domain-is-pure",
      comment:
        "packages/domain/src imports nothing outside packages/domain/src: not an npm " +
        "package (installed or not), not a Node builtin, not another workspace " +
        "package (even through its tsconfig alias), and not anything under apps/.",
      severity: "error",
      from: { path: "^packages/domain/src/" },
      to: { pathNot: "^packages/domain/src/" },
    },
    {
      name: "apps-to-packages-only",
      comment:
        "Nothing under packages/ may import from apps/; dependencies flow from apps " +
        "down to packages, never the other way around.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-app-to-app",
      comment:
        "An app under apps/<x>/ must not import apps/<y>/ for a different y; each app " +
        "is an independently deployable deliverable.",
      severity: "error",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/", pathNot: "^apps/$1/" },
    },
    {
      name: "domain-not-contracts",
      comment:
        "packages/domain must not depend on packages/contracts; contracts describe " +
        "domain shapes to the outside world, never the reverse.",
      severity: "error",
      from: { path: "^packages/domain/src/" },
      to: { path: "^packages/contracts/src/" },
    },
    {
      name: "model-not-use-cases",
      comment:
        "model/ must never reach (directly or transitively) any use-cases/, its own " +
        "concept's or another's; the dependency runs from use-cases down to model, " +
        "never the reverse.",
      severity: "error",
      from: { path: "^packages/domain/src/[^/]+/model/" },
      // Not narrowed to the same concept on purpose: the final validation of a
      // reachable rule matches `to.path` without the `from` capture groups, so a
      // positive `$1` stays literal and never matches. (A negative lookahead like
      // no-use-case-to-use-case's `(?!$1/)` survives that because it degrades to
      // always-true after the derive step has already narrowed by concept.)
      to: { path: "^packages/domain/src/[^/]+/use-cases/", reachable: true },
    },
    {
      name: "concept-entry-point-only",
      comment:
        "A file in one domain concept that imports another concept must import " +
        "exactly that other concept's packages/domain/src/<concept>/index.ts - never " +
        "reach into its model/ or use-cases/ directly.",
      severity: "error",
      from: { path: "^packages/domain/src/([^/]+)/" },
      to: {
        path: "^packages/domain/src/(?!$1/)[^/]+/",
        pathNot: "^packages/domain/src/(?!$1/)[^/]+/index\\.ts$",
      },
    },
    {
      name: "concept-not-domain-root",
      comment:
        "A file inside a domain concept must not import a file at the root of " +
        "packages/domain/src (its index.ts included); a root file can re-export " +
        "another concept's internals and so bypass concept-entry-point-only.",
      severity: "error",
      from: { path: "^packages/domain/src/[^/]+/" },
      to: { path: "^packages/domain/src/[^/]+$" },
    },
    {
      name: "no-use-case-to-use-case",
      comment:
        "A file in one concept's use-cases/ must never reach (directly or " +
        "transitively) a file in another concept's use-cases/, even via that " +
        "concept's index.ts re-exporting them.",
      severity: "error",
      from: { path: "^packages/domain/src/([^/]+)/use-cases/" },
      to: {
        path: "^packages/domain/src/(?!$1/)[^/]+/use-cases/",
        reachable: true,
      },
    },
    {
      name: "no-concept-cycles",
      comment:
        "A dependency cycle must not cross a domain concept boundary, directly or " +
        "indirectly; a cycle fully contained inside a single concept is out of scope.",
      severity: "error",
      from: { path: "^packages/domain/src/([^/]+)/" },
      to: {
        circular: true,
        via: { path: "^packages/domain/src/(?!$1/)[^/]+/" },
      },
    },
    {
      name: "renderer-types-only-from-domain",
      comment:
        "apps/pos/src/renderer/ may depend on packages/domain only for its types; it " +
        "talks to the core process over a MessagePort, never by calling domain code " +
        "directly in-process.",
      severity: "error",
      from: { path: "^apps/pos/src/renderer/" },
      to: {
        path: "^packages/domain/src/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "renderer-no-domain-re-exports",
      comment:
        "apps/pos/src/renderer/ never re-exports from packages/domain. An empty or " +
        "type-only re-export (`export {} from`, `export type { X } from`) is " +
        "classified type-only, yet the empty form is kept by verbatimModuleSyntax " +
        "and loads the domain module at runtime; the renderer has no reason to " +
        "re-export domain at all.",
      severity: "error",
      from: { path: "^apps/pos/src/renderer/" },
      to: { path: "^packages/domain/src/", dependencyTypes: ["export"] },
    },
    {
      name: "renderer-no-db-or-hardware",
      comment:
        "The renderer runs in a sandboxed browser context: it must never touch " +
        "Electron, the database, or serial hardware directly, and never import " +
        "apps/pos/src/core/ - it talks to core only over a MessagePort.",
      severity: "error",
      from: { path: "^apps/pos/src/renderer/" },
      to: {
        path: [
          "^apps/pos/src/core/",
          npmPackage("electron"),
          npmPackage("better-sqlite3"),
          npmPackage("drizzle-orm"),
          npmPackage("serialport"),
          npmPackage("@serialport/[^/]+"),
        ],
      },
    },
    {
      name: "renderer-no-node-builtins",
      comment:
        "The renderer runs in a sandboxed browser context: it must never touch a " +
        "Node builtin module directly.",
      severity: "error",
      from: { path: "^apps/pos/src/renderer/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "register-no-cloud-use-cases",
      comment:
        "Nothing under apps/pos/ may reach (directly or transitively) a use case of " +
        `a cloud-only concept (${CLOUD_ONLY_CONCEPTS.join(", ")}); the ` +
        "register never runs those.",
      severity: "error",
      from: { path: "^apps/pos/" },
      to: {
        path: `^packages/domain/src/(${CLOUD_ONLY_CONCEPTS.join("|")})/use-cases/`,
        reachable: true,
      },
    },
    {
      name: "main-process-scope",
      comment:
        "apps/pos/src/main/ is the Electron main process shell: it may only import " +
        "its own files, apps/pos/src/shared/ (pure code every process's Sentry init " +
        "shares), electron, electron-updater, @sentry/electron (Sentry is " +
        "initialized in main), and Node builtins - not domain, contracts, ui, core, " +
        "renderer, or any other npm package.",
      severity: "error",
      from: { path: "^apps/pos/src/main/" },
      to: {
        pathNot: [
          "^apps/pos/src/main/",
          "^apps/pos/src/shared/",
          npmPackage("electron"),
          npmPackage("electron-updater"),
          npmPackage("@sentry/electron"),
        ],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "shared-is-pure",
      comment:
        "apps/pos/src/shared/ is imported by main, core and renderer alike, so it " +
        "must depend on nothing that isn't already common to all three: no domain, " +
        "contracts, ui, electron, or any other npm package or Node builtin - only " +
        "its own files.",
      severity: "error",
      from: { path: "^apps/pos/src/shared/" },
      to: { pathNot: "^apps/pos/src/shared/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: ["\\.test\\.(ts|tsx)$", "(^|/)dist/"],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
