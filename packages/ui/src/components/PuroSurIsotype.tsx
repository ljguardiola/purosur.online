import isotypeUrl from "../assets/puro-sur-iso.svg";

export interface PuroSurIsotypeProps {
  className?: string;
}

// The SVG file's own <title> never reaches assistive technology through an <img>, so `alt` is the
// isotype's only accessible name.
export function PuroSurIsotype({ className }: PuroSurIsotypeProps) {
  return <img src={isotypeUrl} alt="Puro Sur" className={className} />;
}
