import { PillContent, type PillContentProps, pillClassName } from "./pill-look";

export type { PillTone } from "./pill-look";

export type PillProps = PillContentProps;

export function Pill({ tone, icon, children }: PillProps) {
  return (
    <span className={pillClassName(tone)}>
      <PillContent icon={icon}>{children}</PillContent>
    </span>
  );
}
