import { type Tone, toneClassName } from "../shared/tone";

export type EyebrowProps = {
  text: string;
  tone?: Tone | undefined;
  headingLevel?: 2;
};

export function Eyebrow({ text, tone = "neutral", headingLevel }: EyebrowProps) {
  const Element = headingLevel === undefined ? "p" : "h2";
  return (
    <Element className={`text-caption font-bold uppercase tracking-sm ${toneClassName[tone].text}`}>
      {text}
    </Element>
  );
}
