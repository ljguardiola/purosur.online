// Imported by `vitest.global-setup.postgres.ts`, which runs outside any test worker, so this module
// must not import "vitest" (the same constraint `test-database-snapshot.ts` has).
//
// `cloud_app` is one cluster-wide role shared by every database the cloud-integration run creates,
// so every `runMigrations` call in that run (the global setup's migration of the template database
// and the integration tests that migrate a database of their own) must set this exact same value.
export const CLOUD_APP_PASSWORD = "cloud-app-integration-test-password";
