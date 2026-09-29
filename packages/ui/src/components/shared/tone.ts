export type Tone = "neutral" | "info" | "success" | "warning" | "error";

export type NoticeTone = Exclude<Tone, "neutral">;

type ToneClasses = {
  surface: string;
  strongText: string;
  text: string;
  dot: string;
  spinner: string;
  startBorder: string;
};

export const toneClassName: Record<Tone, ToneClasses> = {
  neutral: {
    surface: "bg-neutral-subtle text-text-subtle",
    strongText: "text-text-subtle",
    text: "text-text-eyebrow",
    dot: "bg-neutral",
    spinner: "text-text-subtle",
    startBorder: "border-l-neutral",
  },
  info: {
    surface: "bg-info-subtle text-info-strong",
    strongText: "text-info-strong",
    text: "text-info",
    dot: "bg-info-soft",
    spinner: "text-info-soft",
    startBorder: "border-l-info-soft",
  },
  success: {
    surface: "bg-success-subtle text-success-strong",
    strongText: "text-success-strong",
    text: "text-success",
    dot: "bg-success-soft",
    spinner: "text-success-soft",
    startBorder: "border-l-success-soft",
  },
  warning: {
    surface: "bg-warning-subtle text-warning-strong",
    strongText: "text-warning-strong",
    text: "text-warning",
    dot: "bg-warning-soft",
    spinner: "text-warning-soft",
    startBorder: "border-l-warning-soft",
  },
  error: {
    surface: "bg-error-subtle text-error-strong",
    strongText: "text-error-strong",
    text: "text-error",
    dot: "bg-error-soft",
    spinner: "text-error-soft",
    startBorder: "border-l-error-soft",
  },
};
