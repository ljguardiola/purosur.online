export const CLOUD_ONLY_CONCEPTS = ["purchasing", "alerts", "catalog", "pricing"];

const REAL_POSTGRES_TEST = "apps/cloud/src/.+\\.integration\\.test\\.ts$";

export const PERSISTENCE_IN_HANDLERS_ALLOWLIST = [
  "apps/cloud/src/access/first-pin-code-route.ts",
  "apps/cloud/src/access/passkeys-list-route.ts",
  "apps/cloud/src/access/passkeys-registration-route.ts",
  "apps/cloud/src/access/passkeys-removal-route.ts",
  "apps/cloud/src/access/pin-code-redemption-route.ts",
  "apps/cloud/src/access/recovery-redemption-route.ts",
  "apps/cloud/src/access/role-creation-route.ts",
  "apps/cloud/src/access/role-edit-route.ts",
  "apps/cloud/src/access/role-read-route.ts",
  "apps/cloud/src/access/roles-list-route.ts",
  "apps/cloud/src/access/session-authenticate-route.ts",
  "apps/cloud/src/access/session-authorization-route.ts",
  "apps/cloud/src/access/session-sign-out-route.ts",
  "apps/cloud/src/access/sign-in-lookup-route.ts",
  "apps/cloud/src/access/user-creation-route.ts",
  "apps/cloud/src/access/user-deactivation-route.ts",
  "apps/cloud/src/access/user-edit-route.ts",
  "apps/cloud/src/access/user-passkey-removal-route.ts",
  "apps/cloud/src/access/user-passkeys-list-route.ts",
  "apps/cloud/src/access/user-pin-code-route.ts",
  "apps/cloud/src/access/user-reactivation-route.ts",
  "apps/cloud/src/alerts/alert-close-route.ts",
  "apps/cloud/src/alerts/alert-read-route.ts",
  "apps/cloud/src/alerts/alerts-list-route.ts",
  "apps/cloud/src/alerts/alerts-overview-route.ts",
  "apps/cloud/src/branch/branch-settings-edit-route.ts",
  "apps/cloud/src/branch/branch-settings-read-route.ts",
  "apps/cloud/src/catalog/brand-deactivation-route.ts",
  "apps/cloud/src/catalog/brand-edit-route.ts",
  "apps/cloud/src/catalog/brand-reactivation-route.ts",
  "apps/cloud/src/catalog/brands-list-route.ts",
  "apps/cloud/src/catalog/categories-list-route.ts",
  "apps/cloud/src/catalog/category-edit-route.ts",
  "apps/cloud/src/catalog/internal-barcode-route.ts",
  "apps/cloud/src/catalog/product-deactivation-route.ts",
  "apps/cloud/src/catalog/product-edit-route.ts",
  "apps/cloud/src/catalog/products-labels-route.ts",
  "apps/cloud/src/catalog/products-list-route.ts",
  "apps/cloud/src/catalog/tag-deactivation-route.ts",
  "apps/cloud/src/catalog/tag-edit-route.ts",
  "apps/cloud/src/catalog/tag-reactivation-route.ts",
  "apps/cloud/src/catalog/tags-list-route.ts",
  "apps/cloud/src/fiscal/issuer-identification-edit-route.ts",
  "apps/cloud/src/fiscal/issuer-identification-read-route.ts",
  "apps/cloud/src/pricing/discount-edit-route.ts",
  "apps/cloud/src/pricing/discount-targets-route.ts",
  "apps/cloud/src/pricing/discounts-list-route.ts",
  "apps/cloud/src/pricing/prices-list-route.ts",
  "apps/cloud/src/register/register-coverage-route.ts",
  "apps/cloud/src/register/register-creation-route.ts",
  "apps/cloud/src/register/register-enrollment-code-route.ts",
  "apps/cloud/src/register/registers-list-route.ts",
  "apps/cloud/src/stock/stock-balances-route.ts",
  "apps/cloud/src/stock/stock-counts-route.ts",
  "apps/cloud/src/stock/stock-movements-route.ts",
  "apps/cloud/src/stock/stock-products-route.ts",
  "apps/cloud/src/sync/changes-route.ts",
];

export const SCREEN_DOMAIN_VALUE_IMPORT_ALLOWLIST = [
  "apps/backoffice/src/access/backoffice-access.ts",
  "apps/backoffice/src/access/email-field-message.ts",
  "apps/backoffice/src/access/passkey-name-message.ts",
  "apps/backoffice/src/access/passkey-row-detail.ts",
  "apps/backoffice/src/access/permission-requirement-note.ts",
  "apps/backoffice/src/access/pin-code-validity.ts",
  "apps/backoffice/src/access/role-editor-form.tsx",
  "apps/backoffice/src/access/role-editor-modal.tsx",
  "apps/backoffice/src/access/role-name-message.ts",
  "apps/backoffice/src/access/role-permissions.ts",
  "apps/backoffice/src/access/roles-list-screen.tsx",
  "apps/backoffice/src/alerts/alert-detail-modal.tsx",
  "apps/backoffice/src/alerts/alerts-list-screen.tsx",
  "apps/backoffice/src/branch/branch-day-row.tsx",
  "apps/backoffice/src/branch/branch-settings-form.ts",
  "apps/backoffice/src/catalog/barcode-chips.tsx",
  "apps/backoffice/src/catalog/brand-name.ts",
  "apps/backoffice/src/catalog/category-form.ts",
  "apps/backoffice/src/catalog/label-preview-bars.tsx",
  "apps/backoffice/src/catalog/net-content-quantity.ts",
  "apps/backoffice/src/catalog/print-labels-modal.tsx",
  "apps/backoffice/src/catalog/product-form.ts",
  "apps/backoffice/src/catalog/tag-form.ts",
  "apps/backoffice/src/fiscal/fiscal-configuration-screen.tsx",
  "apps/backoffice/src/pricing/discount-form.ts",
  "apps/backoffice/src/pricing/discounts-list-screen.tsx",
  "apps/backoffice/src/pricing/money.ts",
  "apps/backoffice/src/pricing/price-form.ts",
  "apps/backoffice/src/register/register-name-message.ts",
  "apps/backoffice/src/stock/count-moment.ts",
  "apps/backoffice/src/stock/stock-movement-form.ts",
  "apps/backoffice/src/stock/stock-movement-modal.tsx",
  "apps/backoffice/src/stock/stock-movements-screen.tsx",
  "apps/backoffice/src/stock/stock-period.ts",
  "apps/backoffice/src/stock/stock-quantity.ts",
];

function exactPaths(paths) {
  return paths.map((path) => `^${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

// Matches an npm package either by its raw specifier (left unresolved when the
// package isn't installed) or by its resolved node_modules path, never by a repo
// folder that happens to share the package's name.
function npmPackage(name) {
  return `^${name}(/|$)|(^|/)node_modules/${name}/`;
}

export default {
  forbidden: [
    {
      name: "domain-is-pure",
      comment:
        "packages/domain/src imports nothing outside packages/domain/src: not an npm " +
        "package (installed or not), not a Node builtin, not another workspace " +
        "package, and not anything under apps/.",
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
      // Not narrowed to the same concept: dependency-cruiser's final check of a reachable
      // rule matches `to.path` without the `from` capture groups, so a positive `$1`
      // would stay literal and never match. A negative lookahead such as `(?!$1/)` still
      // works, because the earlier derive step already narrowed by concept with the groups.
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
      name: "screens-types-only-from-domain",
      comment:
        "apps/pos/src/renderer/ and apps/backoffice/src/ may depend on packages/domain " +
        "only for its types; the renderer talks to the core process over a MessagePort " +
        "and the backoffice to the cloud over HTTP, never by calling domain code " +
        "directly in-process.",
      severity: "error",
      from: {
        path: ["^apps/pos/src/renderer/", "^apps/backoffice/src/"],
        pathNot: exactPaths(SCREEN_DOMAIN_VALUE_IMPORT_ALLOWLIST),
      },
      to: {
        path: "^packages/domain/src/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "screens-no-domain-re-exports",
      comment:
        "apps/pos/src/renderer/ and apps/backoffice/src/ never re-export from " +
        "packages/domain. An empty or type-only re-export (`export {} from`, " +
        "`export type { X } from`) is classified type-only, yet the empty form is kept " +
        "by verbatimModuleSyntax and loads the domain module at runtime; a screen has " +
        "no reason to re-export domain at all.",
      severity: "error",
      from: { path: ["^apps/pos/src/renderer/", "^apps/backoffice/src/"] },
      to: { path: "^packages/domain/src/", dependencyTypes: ["export"] },
    },
    {
      name: "contracts-no-domain-value-re-exports",
      comment:
        "packages/contracts/src may import packages/domain to build its shapes but " +
        "never re-exports a domain value; a type-only re-export is allowed.",
      severity: "error",
      from: { path: "^packages/contracts/src/" },
      to: {
        path: "^packages/domain/src/",
        dependencyTypes: ["export"],
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "persistence-only-in-adapters",
      comment:
        "A cloud route file and a register core request handler never import the " +
        "database directly (drizzle-orm, better-sqlite3, the cloud's schema and " +
        "connection, the register's local database) as a value; only an adapter does, " +
        "and a route or handler reaches it through that adapter. A type-only import, " +
        "which only types the connection handed to an adapter, is allowed.",
      severity: "error",
      from: {
        path: [
          "^apps/cloud/src/[^/]+/.+-route\\.ts$",
          "^apps/pos/src/core/[^/]+/.+-requests\\.ts$",
        ],
        pathNot: exactPaths(PERSISTENCE_IN_HANDLERS_ALLOWLIST),
      },
      to: {
        path: [
          npmPackage("drizzle-orm"),
          npmPackage("better-sqlite3"),
          "^apps/cloud/src/platform/db/",
          "^apps/pos/src/core/platform/local-database\\.ts$",
        ],
        dependencyTypesNot: ["type-only"],
      },
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
        "its own files, apps/pos/src/shared/ (pure code every process " +
        "shares), electron, electron-updater, @sentry/electron (Sentry is " +
        "initialized in main), contracts' entry point (for its error report " +
        "scrubbers alone, which Biome enforces), and Node builtins - not domain, " +
        "another contracts file, ui, core, renderer, or any other npm package.",
      severity: "error",
      from: { path: "^apps/pos/src/main/" },
      to: {
        pathNot: [
          "^apps/pos/src/main/",
          "^apps/pos/src/shared/",
          "^packages/contracts/src/index\\.ts$",
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
    {
      name: "real-postgres-tests-no-pglite",
      comment:
        "Tests that run against a real Postgres, and their global setup, never load " +
        "PGlite or drizzle's PGlite driver, directly or transitively.",
      severity: "error",
      from: {
        path: [`^${REAL_POSTGRES_TEST}`, "^apps/cloud/vitest\\.global-setup\\.postgres\\.ts$"],
      },
      to: {
        path: [npmPackage("@electric-sql/pglite"), npmPackage("drizzle-orm/pglite")],
        reachable: true,
      },
    },
    {
      name: "cloud-server-never-migrates",
      comment:
        "The cloud server never reaches, directly or transitively, the migrate entry " +
        "point or drizzle's migrator: migrations run as their own step before the " +
        "server starts, never from the server.",
      severity: "error",
      from: { path: "^apps/cloud/src/server\\.ts$" },
      to: {
        path: [
          "^apps/cloud/src/migrate\\.ts$",
          "^drizzle-orm/[^/]+/migrator$|(^|/)node_modules/drizzle-orm/[^/]+/migrator\\.",
        ],
        reachable: true,
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: [
        `^(?!${REAL_POSTGRES_TEST}).*\\.test\\.(ts|tsx)$`,
        "^(apps|packages)/[^/]+/(dist|out)/",
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["@purosur/source", "import", "require", "node", "default", "types"],
    },
  },
};
