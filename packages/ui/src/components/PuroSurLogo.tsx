import logoUrl from "../assets/puro-sur-logo.svg";

export interface PuroSurLogoProps {
  // Like every other user-facing string this package renders (see IconButton's aria-label,
  // HighlightedNotice's title/detail), the caller supplies it from its own message catalog:
  // packages/ui never hardcodes text of its own.
  alt: string;
  className?: string;
}

// The brand kit's default, full-color mark (drafts/design/LEEME.md: 01-logos-svg is what to use,
// puro-sur-logo is the default color variant, 05-originales-con-error is never used). Loaded from
// the bundle, never a remote origin, so it clears every app's img-src 'self' CSP. Renders as a
// real <img>, unlike the SVG file's own internal aria-label and <title>, which only reach
// assistive technology when the SVG is inlined, not referenced through an <img> src.
export function PuroSurLogo({ alt, className }: PuroSurLogoProps) {
  return <img src={logoUrl} alt={alt} className={className} />;
}
