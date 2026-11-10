import type { ReactNode } from "react";
import { toneClassName } from "../shared/tone";

export type StatusPillTone = "neutral" | "warning" | "error";

export type StatusPillContent = {
  tone: StatusPillTone;
  children: Exclude<ReactNode, null | undefined | boolean>;
};

export function statusPillClassName(tone: StatusPillTone): string {
  return (
    "inline-flex h-control-xs items-center whitespace-nowrap rounded-full px-3 font-sans " +
    `text-caption font-bold ${toneClassName[tone].surface}`
  );
}
