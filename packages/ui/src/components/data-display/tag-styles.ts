import { type Tone, toneClassName } from "../shared/tone";

export type TagTone = Extract<Tone, "neutral" | "info">;

export const tagToneClassName: Record<TagTone, string> = {
  neutral: "bg-surface-subtle text-text-subtle",
  info: toneClassName.info.surface,
};

const dotBaseClassName = "size-1.5 shrink-0 rounded-full";

export const tagDotClassName: Record<TagTone, string> = {
  neutral: `${dotBaseClassName} ${toneClassName.neutral.dot}`,
  info: `${dotBaseClassName} ${toneClassName.info.dot}`,
};
