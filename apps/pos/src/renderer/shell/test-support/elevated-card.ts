import { tokenRgb } from "@purosur/ui/test";

export type ElevatedCardTone = "info" | "error";

export function elevatedCardOf(heading: Element): { surface: string; badge: string } | undefined {
  let card: Element | null = heading.parentElement;
  while (card !== null && getComputedStyle(card).boxShadow === "none") {
    card = card.parentElement;
  }
  const badge = heading.previousElementSibling;
  if (card === null || badge === null) {
    return undefined;
  }
  return {
    surface: getComputedStyle(card).backgroundColor,
    badge: getComputedStyle(badge).backgroundColor,
  };
}

export function elevatedCardWithBadge(tone: ElevatedCardTone): { surface: string; badge: string } {
  return { surface: tokenRgb("surface"), badge: tokenRgb(`${tone}-subtle`) };
}
