import isotypeUrl from "../../assets/puro-sur-iso.svg";

export interface PuroSurIsotypeProps {
  className?: string;
  decorative?: boolean;
}

// The SVG file's own <title> never reaches assistive technology through an <img>, so `alt` is the
// isotype's only accessible name.
export function PuroSurIsotype({ className, decorative = false }: PuroSurIsotypeProps) {
  return <img src={isotypeUrl} alt={decorative ? "" : "Puro Sur"} className={className} />;
}
