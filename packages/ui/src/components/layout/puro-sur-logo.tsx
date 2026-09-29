import logoUrl from "../../assets/puro-sur-logo.svg";

export interface PuroSurLogoProps {
  className?: string;
}

// The SVG file's own <title> never reaches assistive technology through an <img>, so `alt` is the
// logo's only accessible name.
export function PuroSurLogo({ className }: PuroSurLogoProps) {
  return <img src={logoUrl} alt="Puro Sur" className={className} />;
}
