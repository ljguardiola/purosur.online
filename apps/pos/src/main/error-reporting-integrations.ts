// Names as @sentry/electron's main-process SDK registers its default integrations.
// - SentryMinidump starts Electron's crash reporter and uploads each native crash's minidump, a
//   copy of process memory that no event scrubbing ever reads; ElectronMinidump is its alternative.
// - PreloadInjection injects Sentry's own preload, which exposes an API on the page's window.
// - ChildProcess reports a crashed or out-of-memory process only through the minidump by default.
const REPLACED_DEFAULT_INTEGRATIONS = new Set([
  "SentryMinidump",
  "ElectronMinidump",
  "PreloadInjection",
  "ChildProcess",
]);

export const CHILD_PROCESS_EVENT_REASONS = [
  "abnormal-exit",
  "launch-failed",
  "integrity-failure",
  "crashed",
  "oom",
] as const;

export function withoutReplacedDefaultIntegrations<I extends { readonly name: string }>(
  defaults: readonly I[],
): I[] {
  return defaults.filter(({ name }) => !REPLACED_DEFAULT_INTEGRATIONS.has(name));
}
