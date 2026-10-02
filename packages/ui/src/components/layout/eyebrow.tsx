export type EyebrowProps = {
  text: string;
};

export function Eyebrow({ text }: EyebrowProps) {
  return <p className="text-caption font-bold text-text-eyebrow uppercase tracking-sm">{text}</p>;
}
