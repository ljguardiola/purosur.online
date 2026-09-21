import isotypeUrl from "../assets/puro-sur-iso.svg";

export interface PuroSurIsotypeProps {
  alt: string;
  className?: string;
}

// The SVG file's own <title> never reaches assistive technology through an <img>, so `alt` is the
// isotype's only accessible name.
export function PuroSurIsotype({ alt, className }: PuroSurIsotypeProps) {
  return <img src={isotypeUrl} alt={alt} className={className} />;
}
