// Loaded both by `vitest.global-setup.postgres.ts` (which runs outside any test worker, so this
// module must not import "vitest", the same constraint `test-database-snapshot.ts` has) and by
// `recovery-integration-database.ts`.
//
// `cloud_app` is one cluster-wide role shared by every database the cloud-integration run creates.
// The global setup sets this password once, migrating the one template database every integration
// test file's own database is created from (`CREATE DATABASE ... TEMPLATE`, see
// `createIntegrationDatabase`). The few files that still call `runMigrations` directly
// (`migrate-cloud-app-role.integration.test.ts`, `wait-for-ready.integration.test.ts`) set it again,
// serialized through `withExclusiveMigration` so they never race the template's own migration or
// each other, but every one of them must still agree on this exact same value.
export const CLOUD_APP_PASSWORD = "cloud-app-integration-test-password";
