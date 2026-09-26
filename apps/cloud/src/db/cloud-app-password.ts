// Loaded outside any test worker (by the Postgres global setup), so this module must not import
// "vitest". `cloud_app` is one cluster-wide role, so every `runMigrations` call in an integration
// run must set this same password.
export const CLOUD_APP_PASSWORD = "cloud-app-integration-test-password";
