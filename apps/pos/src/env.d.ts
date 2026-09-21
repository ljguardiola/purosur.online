/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_SENTRY_DSN?: string;
  readonly RENDERER_VITE_SENTRY_DSN?: string;
  readonly POS_CHANNEL: "production" | "homologation";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
