import logoUrl from "../assets/puro-sur-logo.svg";

export interface PuroSurLogoProps {
  alt: string;
  className?: string;
}

// The SVG file's own <title> never reaches assistive technology through an <img>, so `alt` is the
// logo's only accessible name.
export function PuroSurLogo({ alt, className }: PuroSurLogoProps) {
  return <img src={logoUrl} alt={alt} className={className} />;
}
