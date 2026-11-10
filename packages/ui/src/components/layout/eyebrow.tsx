import { type Tone, toneClassName } from "../shared/tone";

type EyebrowHeadingLevel = 2 | 3;

export type EyebrowProps = {
  text: string;
  tone?: Tone | undefined;
  headingLevel?: EyebrowHeadingLevel;
};

const headingElement = { 2: "h2", 3: "h3" } as const satisfies Record<EyebrowHeadingLevel, string>;

export function Eyebrow({ text, tone = "neutral", headingLevel }: EyebrowProps) {
  const Element = headingLevel === undefined ? "p" : headingElement[headingLevel];
  return (
    <Element className={`text-caption font-bold uppercase tracking-sm ${toneClassName[tone].text}`}>
      {text}
    </Element>
  );
}
