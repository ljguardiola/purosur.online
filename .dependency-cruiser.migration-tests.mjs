import config from "./.dependency-cruiser.mjs";

const CLOUD_MIGRATION_TEST = "apps/cloud/src/.+-migration\\.test\\.ts$";
const MIGRATION_UNDER_TEST = "^apps/cloud/src/platform/db/test-support/migration-under-test\\.ts$";

export default {
  forbidden: [
    {
      name: "cloud-migration-tests-migrate-through-migration-under-test",
      comment:
        "A cloud migration test reaches its database only through migration-under-test, " +
        "which hands current code a client only once every later migration is applied, " +
        "never by migrating a database itself, directly or through any other module. " +
        "This cruise leaves migration-under-test out, so whatever a migration test still " +
        "reaches got there by another route.",
      severity: "error",
      from: { path: `^${CLOUD_MIGRATION_TEST}` },
      to: {
        path: [
          "^drizzle-orm/[^/]+/migrator$|(^|/)node_modules/drizzle-orm/[^/]+/migrator\\.",
          "^apps/cloud/src/test-support/test-database-snapshot\\.ts$",
          "^apps/cloud/src/platform/db/test-support/migration-journal-test-helpers\\.ts$",
        ],
        reachable: true,
      },
    },
  ],
  options: {
    ...config.options,
    exclude: {
      path: [
        `^(?!${CLOUD_MIGRATION_TEST}).*\\.test\\.(ts|tsx)$`,
        "^(apps|packages)/[^/]+/(dist|out)/",
        MIGRATION_UNDER_TEST,
      ],
    },
  },
};
