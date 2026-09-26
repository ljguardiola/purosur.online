// @sentry/electron's own main-process defaults: minidump crash capture, preload injection exposing
// an API on window, and minidump-only reporting for a crashed or OOM child process.
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
