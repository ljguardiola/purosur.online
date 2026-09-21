/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_SENTRY_DSN?: string;
  readonly RENDERER_VITE_SENTRY_DSN?: string;
  readonly SENTRY_ENVIRONMENT: "production" | "staging";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
