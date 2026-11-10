import { type StatusPillContent, statusPillClassName } from "./status-pill-look";

export type { StatusPillTone } from "./status-pill-look";

export type StatusPillProps = StatusPillContent;

export function StatusPill({ tone, children }: StatusPillProps) {
  return <span className={statusPillClassName(tone)}>{children}</span>;
}
