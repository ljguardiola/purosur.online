import { type Tone, toneClassName } from "../shared/tone";

export type TagTone = Extract<Tone, "neutral" | "info" | "success" | "warning">;

export const tagToneClassName: Record<TagTone, string> = {
  neutral: "bg-surface-subtle text-text-subtle",
  info: toneClassName.info.surface,
  success: toneClassName.success.surface,
  warning: toneClassName.warning.surface,
};

export function tagDotClassName(tone: TagTone): string {
  return `size-1.5 shrink-0 rounded-full ${toneClassName[tone].dot}`;
}
